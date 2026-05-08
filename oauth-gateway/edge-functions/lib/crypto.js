const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function base64UrlEncode(bytes) {
  const array = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let binary = "";
  for (const byte of array) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(input) {
  let value = input.replace(/-/g, "+").replace(/_/g, "/");
  while (value.length % 4) value += "=";
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

export function encodeJson(value) {
  return base64UrlEncode(textEncoder.encode(JSON.stringify(value)));
}

export function decodeJson(input) {
  return JSON.parse(textDecoder.decode(base64UrlDecode(input)));
}

export async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return base64UrlEncode(digest);
}

export function randomId(bytes = 32) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

export async function hmacSign(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  return crypto.subtle.sign("HMAC", key, textEncoder.encode(data));
}

export async function hmacVerify(data, signature, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify("HMAC", key, signature, textEncoder.encode(data));
}

