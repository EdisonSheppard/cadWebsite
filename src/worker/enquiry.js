import site from "../../site.config.json";
import { ensureSchema } from "./db.js";
import { emailConfigured, sendEnquiryEmails } from "./email.js";
import { esc, json, newTicketId, nowIso, randomCode, sha256Hex } from "./util.js";

const SERVICES = ["replacement", "mount", "print", "cad", "unsure"];

// Which optional fields are kept for each service. Anything else is ignored,
// so a CAD-only job can never carry print material or postage details.
const FIELDS_BY_SERVICE = {
  replacement: ["fit", "sample", "environment", "quantity", "material", "colour", "fulfilment", "suburb", "deadline"],
  mount: ["fit", "sample", "environment", "quantity", "material", "colour", "fulfilment", "suburb", "deadline"],
  print: ["units", "size", "environment", "quantity", "material", "colour", "fulfilment", "suburb", "deadline"],
  cad: ["fit", "units", "size", "deliverables", "deadline"],
  unsure: ["fit", "environment", "deadline"],
};

const CHOICES = {
  sample: ["yes", "maybe", "no"],
  units: ["mm", "in"],
  fulfilment: ["pickup", "post", "unsure"],
  contact_pref: ["email", "phone", "sms"],
  environment: ["outdoor", "heat", "load", "flex", "safety"],
  deliverables: ["step", "stl", "drawing", "native"],
};
const MATERIALS = ["recommend", ...site.materials.filter((m) => m.available).map((m) => m.id)];
const TEXT_LIMITS = { fit: 3000, size: 120, colour: 60, suburb: 80 };

const MAX_FILES = site.upload.maxFiles;
const MAX_BYTES = site.upload.maxTotalMb * 1024 * 1024;
const EXTENSIONS = new Set(site.upload.extensions);
const RATE_LIMIT_PER_HOUR = 5;

const clean = (v, max) => String(v ?? "").replace(/\u0000/g, "").trim().slice(0, max);

// Checks a file's first bytes against its extension. Model formats are
// loosely checked, since STL and OBJ have no reliable signature.
function sniff(ext, bytes) {
  const b = bytes.subarray(0, 16);
  const ascii = new TextDecoder("latin1").decode(bytes.subarray(0, 32));
  const zip = b[0] === 0x50 && b[1] === 0x4b;
  switch (ext) {
    case "jpg":
    case "jpeg":
      return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? "image/jpeg" : null;
    case "png":
      return b[0] === 0x89 && ascii.slice(1, 4) === "PNG" ? "image/png" : null;
    case "webp":
      return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP" ? "image/webp" : null;
    case "heic":
    case "heif":
      return ascii.slice(4, 8) === "ftyp" ? "image/heic" : null;
    case "pdf":
      return ascii.startsWith("%PDF") ? "application/pdf" : null;
    case "3mf":
    case "f3z":
    case "f3d":
      return zip ? "model" : null;
    case "step":
    case "stp":
      return ascii.trimStart().startsWith("ISO-10303-21") ? "model" : null;
    case "stl":
    case "obj":
      return bytes.length > 0 ? "model" : null;
    default:
      return null;
  }
}

function safeName(name) {
  const base = name.split(/[\\/]/).pop() || "file";
  return base.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_").slice(-100);
}

async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;
  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET_KEY);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    return Boolean((await res.json()).success);
  } catch {
    return false;
  }
}

function respond(request, status, body) {
  const wantsJson = (request.headers.get("accept") || "").includes("application/json");
  if (wantsJson) return json(body, status);
  if (body.ok) return Response.redirect(new URL(`/thanks?ref=${encodeURIComponent(body.ref)}`, request.url).toString(), 303);
  const items = (body.errors || []).map((e) => `<li>${esc(e)}</li>`).join("");
  return new Response(
    `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Enquiry not sent</title><link rel="stylesheet" href="/assets/styles.css"></head><body><main class="section"><div class="wrap prose"><h1>Your enquiry wasn't sent</h1><ul>${items}</ul><p>Go back, fix these and send it again. Your answers should still be in the form.</p></div></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
  );
}

export async function handleEnquiry(request, env, ctx) {
  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data") && !ct.includes("application/x-www-form-urlencoded")) {
    return respond(request, 415, { ok: false, errors: ["Send the enquiry using the form on the quote page."] });
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BYTES + 2 * 1024 * 1024) {
    return respond(request, 413, { ok: false, errors: [`Files add up to more than ${site.upload.maxTotalMb} MB. Leave some out and mention them in the description.`] });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return respond(request, 400, { ok: false, errors: ["The form data couldn't be read. Refresh the page and try again."] });
  }

  // Bots: honeypot filled, or form submitted impossibly fast. Pretend success.
  const startedAt = Number(form.get("started_at") || 0);
  if (clean(form.get("website"), 200) || (startedAt && Date.now() - startedAt < 2500)) {
    return respond(request, 200, { ok: true, ref: newTicketId(), emailed: false });
  }

  await ensureSchema(env.DB);

  const ip = request.headers.get("cf-connecting-ip") || "";
  const errors = [];

  if (!(await verifyTurnstile(env, form.get("cf-turnstile-response"), ip))) {
    errors.push("The spam check didn't complete. Wait for the tick, then send again.");
  }

  // Idempotency: a double-click or network retry returns the first ticket.
  const submissionId = clean(form.get("submission_id"), 80) || null;
  if (submissionId) {
    const existing = await env.DB.prepare("SELECT id FROM enquiries WHERE submission_id = ?").bind(submissionId).first();
    if (existing) return respond(request, 200, { ok: true, ref: existing.id, emailed: emailConfigured(env), duplicate: true });
  }

  const service = clean(form.get("service"), 20);
  if (!SERVICES.includes(service)) errors.push("Choose what you need at the top of the form.");
  const name = clean(form.get("name"), 100);
  if (!name) errors.push("Enter your name.");
  const email = clean(form.get("email"), 200).toLowerCase();
  if (!/^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i.test(email)) errors.push("Enter a valid email address.");
  const phone = clean(form.get("phone"), 30);
  if (phone && !/^[\d\s()+-]{6,30}$/.test(phone)) errors.push("Enter the phone number using digits only.");
  const contactPref = CHOICES.contact_pref.includes(form.get("contact_pref")) ? form.get("contact_pref") : "email";
  if ((contactPref === "phone" || contactPref === "sms") && !phone) errors.push("Add a phone number, or choose email as the way to reach you.");
  const description = clean(form.get("description"), 5000);
  if (description.length < 10) errors.push("Describe the part in a sentence or two.");
  if (form.get("consent") !== "yes") errors.push("Tick the box to agree to the privacy policy and terms.");

  // Service-specific details
  const details = {};
  for (const field of FIELDS_BY_SERVICE[service] || []) {
    if (field === "environment" || field === "deliverables") {
      const vals = form.getAll(field).map(String).filter((v) => CHOICES[field].includes(v));
      if (vals.length) details[field] = [...new Set(vals)];
    } else if (field === "quantity") {
      const q = Number(form.get("quantity") || 1);
      if (!Number.isInteger(q) || q < 1 || q > 500) errors.push("Quantity must be a whole number from 1 to 500.");
      else details.quantity = q;
    } else if (field === "material") {
      const m = String(form.get("material") || "recommend");
      details.material = MATERIALS.includes(m) ? m : "recommend";
    } else if (field === "deadline") {
      const d = clean(form.get("deadline"), 10);
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) details.deadline = d;
    } else if (CHOICES[field]) {
      const v = String(form.get(field) || "");
      if (CHOICES[field].includes(v)) details[field] = v;
    } else {
      const v = clean(form.get(field), TEXT_LIMITS[field]);
      if (v) details[field] = v;
    }
  }

  // Files
  const files = form.getAll("files").filter((f) => f && typeof f === "object" && f.size > 0);
  if (files.length > MAX_FILES) errors.push(`Choose up to ${MAX_FILES} files.`);
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_BYTES) errors.push(`Files add up to more than ${site.upload.maxTotalMb} MB. Leave some out and mention them in the description.`);
  const prepared = [];
  if (files.length <= MAX_FILES && total <= MAX_BYTES) {
    for (const f of files) {
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      if (!EXTENSIONS.has(ext)) {
        errors.push(`${safeName(f.name)} isn't an accepted file type.`);
        continue;
      }
      const bytes = new Uint8Array(await f.arrayBuffer());
      const kind = sniff(ext, bytes);
      if (!kind) {
        errors.push(`${safeName(f.name)} doesn't look like a real .${ext} file. Export it again and retry.`);
        continue;
      }
      prepared.push({ name: safeName(f.name), bytes, kind, sha256: await sha256Hex(bytes) });
    }
  }

  // Rate limit by hashed IP. The raw address is never stored.
  const ipHash = ip ? await sha256Hex(`${env.IP_SALT || "cadwebsite"}:${ip}`) : null;
  if (ipHash && !errors.length) {
    const since = new Date(Date.now() - 3600 * 1000).toISOString();
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM enquiries WHERE ip_hash = ? AND created_at > ?").bind(ipHash, since).first();
    if (row && row.n >= RATE_LIMIT_PER_HOUR) errors.push("Too many enquiries from this connection in the last hour. Try again later.");
  }

  if (errors.length) return respond(request, 400, { ok: false, errors });

  // Store files first, then the database rows. If the database write fails,
  // the files are removed so nothing is left orphaned.
  const id = newTicketId();
  const created = nowIso();
  const fileRows = [];
  try {
    for (const p of prepared) {
      const fileId = randomCode(10);
      const key = `enquiries/${id}/${fileId}-${p.name}`;
      await env.UPLOADS.put(key, p.bytes, {
        httpMetadata: { contentType: "application/octet-stream" },
        customMetadata: { enquiry: id, originalName: p.name, sha256: p.sha256 },
      });
      fileRows.push({ id: fileId, r2_key: key, original_name: p.name, size: p.bytes.length, kind: p.kind, sha256: p.sha256 });
    }

    const enquiry = {
      id,
      service,
      name,
      email,
      phone,
      contact_pref: contactPref,
      description,
      details,
    };
    const stmts = [
      env.DB.prepare(
        `INSERT INTO enquiries (id, submission_id, created_at, updated_at, service, name, email, phone, contact_pref, description, details, terms_version, ip_hash, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, submissionId, created, created, service, name, email, phone || null, contactPref, description,
        JSON.stringify(details), clean(form.get("terms_version"), 20) || site.termsVersion, ipHash,
        clean(request.headers.get("user-agent"), 300)
      ),
      ...fileRows.map((f) =>
        env.DB.prepare(
          "INSERT INTO enquiry_files (id, enquiry_id, r2_key, original_name, size, kind, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(f.id, id, f.r2_key, f.original_name, f.size, f.kind, f.sha256, created)
      ),
      env.DB.prepare("INSERT INTO events (enquiry_id, at, actor, action, detail) VALUES (?, ?, 'customer', 'submitted', ?)").bind(
        id, created, `${fileRows.length} file(s)`
      ),
    ];
    await env.DB.batch(stmts);

    ctx.waitUntil(sendEnquiryEmails(env, new URL(request.url).origin, enquiry, fileRows));
    return respond(request, 200, { ok: true, ref: id, emailed: emailConfigured(env) });
  } catch (err) {
    console.error("enquiry store failed", err);
    if (fileRows.length) await env.UPLOADS.delete(fileRows.map((f) => f.r2_key)).catch(() => {});
    if (submissionId && String(err).includes("UNIQUE")) {
      const existing = await env.DB.prepare("SELECT id FROM enquiries WHERE submission_id = ?").bind(submissionId).first();
      if (existing) return respond(request, 200, { ok: true, ref: existing.id, emailed: emailConfigured(env), duplicate: true });
    }
    return respond(request, 500, { ok: false, errors: ["Something went wrong saving your enquiry. Nothing was saved, so please try again in a few minutes."] });
  }
}
