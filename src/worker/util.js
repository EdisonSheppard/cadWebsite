export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export const nowIso = () => new Date().toISOString();

// Queensland has no daylight saving, so Brisbane is always UTC+10.
export function brisbane(iso) {
  const d = new Date(new Date(iso).getTime() + 10 * 3600 * 1000);
  return d.toISOString().replace("T", " ").slice(0, 16);
}

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function randomCode(len) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function newTicketId() {
  const d = brisbane(nowIso()); // "2026-11-07 15:20"
  return `Q-${d.slice(2, 4)}${d.slice(5, 7)}${d.slice(8, 10)}-${randomCode(4)}`;
}

export async function sha256Hex(data) {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function timingSafeEqualStr(a, b) {
  const [ha, hb] = await Promise.all([sha256Hex(String(a)), sha256Hex(String(b))]);
  const ea = new TextEncoder().encode(ha);
  const eb = new TextEncoder().encode(hb);
  return crypto.subtle.timingSafeEqual(ea, eb) && a.length === b.length;
}

export const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "x-frame-options": "DENY",
  "strict-transport-security": "max-age=31536000",
};
