export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeEmailDomain(domain) {
  return String(domain || "").trim().toLowerCase();
}

export function isEmailAllowed(email, access, user) {
  const normalized = normalizeEmail(email);
  if (!normalized || !access) return false;
  if (!user || user.enabled === false) return false;
  const allowedEmails = Array.isArray(access.allowed_emails) ? access.allowed_emails.map(normalizeEmail) : [];
  if (allowedEmails.indexOf(normalized) >= 0) return true;
  const domain = normalized.split("@")[1] || "";
  const allowedDomains = Array.isArray(access.allowed_email_domains) ? access.allowed_email_domains.map(normalizeEmailDomain) : [];
  return Boolean(domain && allowedDomains.indexOf(domain) >= 0);
}
