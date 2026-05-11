const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function base64UrlDecode(input) {
  let value = String(input || "").trim().replace(/-/g, "+").replace(/_/g, "/");
  while (value.length % 4) value += "=";
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

function decodeJsonSegment(segment) {
  return JSON.parse(textDecoder.decode(base64UrlDecode(segment)));
}

function hexToBytes(value) {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function extractEnvValue(input, name) {
  const pattern = new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`, "m");
  const match = String(input || "").match(pattern);
  if (!match) return "";
  return match[1].replace(/^['"]|['"]$/g, "");
}

function parseKeyMap(input) {
  const raw = String(input || "").trim();
  const envKeys = extractEnvValue(raw, "GATEWAY_TOKEN_KEYS");
  const envKid = extractEnvValue(raw, "GATEWAY_TOKEN_ACTIVE_KID");
  const candidate = envKeys || raw;
  if (candidate.startsWith("{")) {
    try {
      return { keys: JSON.parse(candidate), activeKid: envKid || "" };
    } catch {
      throw codedError("TOKEN_KEY_INVALID");
    }
  }
  return { keys: { pasted: candidate }, activeKid: envKid || "pasted" };
}

async function keyBytesFromValue(value) {
  const raw = String(value || "").trim();
  if (/^[a-f0-9]{64}$/i.test(raw)) return hexToBytes(raw);
  try {
    const decoded = base64UrlDecode(raw);
    if (decoded.byteLength === 32) return decoded;
  } catch {
    // Fall through to password derivation.
  }
  return new Uint8Array(await crypto.subtle.digest("SHA-256", textEncoder.encode(raw)));
}

function selectKeyMaterial(keyInput, headerKid) {
  const { keys, activeKid } = parseKeyMap(keyInput);
  if (headerKid && !keys[headerKid]) throw codedError("TOKEN_KEY_NOT_FOUND");
  const kid = headerKid || (activeKid && keys[activeKid] ? activeKid : Object.keys(keys)[0]);
  if (!kid || !keys[kid]) throw codedError("TOKEN_KEY_NOT_FOUND");
  return { kid, material: keys[kid] };
}

export async function decryptGatewayToken(tokenInput, keyInput) {
  const token = String(tokenInput || "").trim();
  const parts = token.split(".");
  if (parts.length !== 3) throw codedError("TOKEN_FORMAT_INVALID");
  const [headerSegment, ivSegment, ciphertextSegment] = parts;
  let header;
  try {
    header = decodeJsonSegment(headerSegment);
  } catch {
    throw codedError("TOKEN_FORMAT_INVALID");
  }
  if (header.typ !== "gateway_access" || header.alg !== "dir" || header.enc !== "A256GCM") {
    throw codedError("TOKEN_HEADER_UNSUPPORTED");
  }
  const selected = selectKeyMaterial(keyInput, header.kid);
  const keyBytes = await keyBytesFromValue(selected.material);
  if (keyBytes.byteLength !== 32) throw codedError("TOKEN_KEY_INVALID");
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64UrlDecode(ivSegment),
        additionalData: textEncoder.encode(headerSegment),
        tagLength: 128
      },
      key,
      base64UrlDecode(ciphertextSegment)
    );
  } catch {
    throw codedError("TOKEN_DECRYPT_FAILED");
  }
  return {
    header,
    selected_kid: selected.kid,
    payload: JSON.parse(textDecoder.decode(plaintext))
  };
}

function maskEmail(value) {
  const email = String(value || "");
  const [name, domain] = email.split("@");
  if (!name || !domain) return email ? "***" : "";
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskHost(value) {
  const host = String(value || "");
  if (!host) return "";
  const parts = host.split(".");
  if (parts.length < 2) return "***";
  return `***.${parts.slice(-2).join(".")}`;
}

export function redactGatewayTokenPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  return {
    ...payload,
    sub: maskEmail(payload.sub),
    email: maskEmail(payload.email),
    origin: payload.origin ? {
      ...payload.origin,
      origin_ip: payload.origin.origin_ip ? "***" : "",
      origin_host_header: maskHost(payload.origin.origin_host_header)
    } : payload.origin
  };
}
