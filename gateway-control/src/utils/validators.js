export function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function normalizeEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? value : "";
}

export function normalizeHost(host) {
  const value = String(host || "").trim().toLowerCase();
  if (value.includes("/") || value.includes("@") || value.includes(",")) return "";
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value) ? value : "";
}

export function nowIso() {
  return new Date().toISOString();
}

