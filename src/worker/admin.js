import { ensureSchema, STATUSES } from "./db.js";
import { SERVICE_LABELS } from "./email.js";
import { brisbane, esc, nowIso, SECURITY_HEADERS, timingSafeEqualStr } from "./util.js";

const STATUS_LABEL = Object.fromEntries(STATUSES);
const DETAIL_LABELS = {
  fit: "Fits / measurements",
  sample: "Original available",
  units: "File units",
  size: "Intended size",
  deliverables: "Files wanted",
  environment: "Use conditions",
  quantity: "Quantity",
  material: "Material",
  colour: "Colour",
  fulfilment: "Pickup or post",
  suburb: "Suburb",
  deadline: "Needed by",
  source: "Found us via",
};

const ADMIN_HEADERS = {
  ...SECURITY_HEADERS,
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "content-security-policy": "default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

async function authorised(request, env) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Basic ")) return false;
  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  const [user, pass] = [decoded.slice(0, i), decoded.slice(i + 1)];
  const userOk = await timingSafeEqualStr(user, env.ADMIN_USER || "admin");
  const passOk = await timingSafeEqualStr(pass, env.ADMIN_PASSWORD);
  return userOk && passOk;
}

function page(title, body, status = 200) {
  return new Response(
    `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} | Admin</title><link rel="stylesheet" href="/assets/styles.css"><link rel="stylesheet" href="/assets/admin.css"></head><body class="admin"><header class="admin-bar"><a href="/admin">Enquiries</a><a href="/admin/export.csv">Export CSV</a><a href="/">View site</a></header><main class="admin-main">${body}</main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", ...ADMIN_HEADERS } }
  );
}

const fmtSize = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const statusPill = (s) => `<span class="pill pill-${esc(s)}">${esc(STATUS_LABEL[s] || s)}</span>`;

export async function handleAdmin(request, env) {
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12) {
    return new Response("Admin is disabled. Set an ADMIN_PASSWORD secret of at least 12 characters.", {
      status: 503,
      headers: { "content-type": "text/plain", ...ADMIN_HEADERS },
    });
  }
  if (!(await authorised(request, env))) {
    return new Response("Sign in required.", {
      status: 401,
      headers: { "www-authenticate": 'Basic realm="admin", charset="UTF-8"', "content-type": "text/plain", ...ADMIN_HEADERS },
    });
  }

  await ensureSchema(env.DB);
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/admin";

  if (request.method === "POST") {
    // Same-origin check guards the cookie-less Basic auth session against CSRF.
    const origin = request.headers.get("origin");
    if (!origin || origin !== url.origin) return page("Blocked", "<p>Request blocked: it didn't come from this site.</p>", 403);
  }

  if (path === "/admin" && request.method === "GET") return list(env, url);
  if (path === "/admin/export.csv" && request.method === "GET") return exportCsv(env);

  let m = path.match(/^\/admin\/enquiry\/([A-Z0-9-]{6,20})$/);
  if (m && request.method === "GET") return detail(env, m[1]);
  if (m && request.method === "POST") return update(request, env, m[1]);

  m = path.match(/^\/admin\/enquiry\/([A-Z0-9-]{6,20})\/delete$/);
  if (m && request.method === "POST") return remove(request, env, m[1]);

  m = path.match(/^\/admin\/file\/([A-Z0-9]{10})$/);
  if (m && request.method === "GET") return file(env, m[1], url.searchParams.has("view"));

  return page("Not found", "<p>Not found.</p>", 404);
}

async function list(env, url) {
  const status = url.searchParams.get("status") || "open";
  const closed = ["done", "declined", "cancelled"];
  let sql = `SELECT e.*, (SELECT COUNT(*) FROM enquiry_files f WHERE f.enquiry_id = e.id) AS file_count FROM enquiries e`;
  const binds = [];
  if (status === "open") sql += ` WHERE e.status NOT IN (${closed.map(() => "?").join(",")})`, binds.push(...closed);
  else if (status !== "all") sql += " WHERE e.status = ?", binds.push(status);
  sql += " ORDER BY e.created_at DESC LIMIT 500";
  const { results } = await env.DB.prepare(sql).bind(...binds).all();

  const filters = [["open", "Open"], ["all", "All"], ...STATUSES]
    .map(([v, l]) => `<option value="${v}"${v === status ? " selected" : ""}>${esc(l)}</option>`)
    .join("");
  const rows = results
    .map(
      (e) => `<tr>
      <td><a href="/admin/enquiry/${esc(e.id)}">${esc(e.id)}</a></td>
      <td>${esc(brisbane(e.created_at))}</td>
      <td>${esc(e.name)}</td>
      <td>${esc(SERVICE_LABELS[e.service] || e.service)}</td>
      <td>${statusPill(e.status)}</td>
      <td>${esc(e.quote_amount)}</td>
      <td>${e.paid ? "Paid" : ""}</td>
      <td>${e.file_count || ""}</td>
    </tr>`
    )
    .join("");
  return page(
    "Enquiries",
    `<div class="admin-head"><h1>Enquiries</h1>
    <form method="get" class="admin-filter"><label for="status">Show</label><select id="status" name="status">${filters}</select><button class="btn btn-small" type="submit">Filter</button></form></div>
    ${
      results.length
        ? `<div class="table-scroll"><table class="admin-table"><thead><tr><th>Ref</th><th>Received</th><th>Name</th><th>Service</th><th>Status</th><th>Quote</th><th>Paid</th><th>Files</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<p class="empty">No enquiries here yet. New ones appear as soon as someone sends the quote form.</p>`
    }`
  );
}

async function detail(env, id) {
  const e = await env.DB.prepare("SELECT * FROM enquiries WHERE id = ?").bind(id).first();
  if (!e) return page("Not found", "<p>No enquiry with that reference.</p>", 404);
  const [{ results: files }, { results: events }] = await Promise.all([
    env.DB.prepare("SELECT * FROM enquiry_files WHERE enquiry_id = ? ORDER BY created_at").bind(id).all(),
    env.DB.prepare("SELECT * FROM events WHERE enquiry_id = ? ORDER BY id DESC").bind(id).all(),
  ]);
  const details = JSON.parse(e.details || "{}");
  const detailRows = Object.entries(details)
    .map(([k, v]) => `<tr><th>${esc(DETAIL_LABELS[k] || k)}</th><td>${esc(Array.isArray(v) ? v.join(", ") : v)}</td></tr>`)
    .join("");
  const safety = (details.environment || []).includes("safety")
    ? `<p class="note">Customer flagged that failure could injure someone. Check suitability before quoting.</p>`
    : "";
  const fileItems = files
    .map((f) => {
      const img = ["image/jpeg", "image/png", "image/webp"].includes(f.kind);
      return `<li>${img ? `<a href="/admin/file/${esc(f.id)}?view"><img src="/admin/file/${esc(f.id)}?view" alt="" loading="lazy"></a>` : ""}
        <a href="/admin/file/${esc(f.id)}">${esc(f.original_name)}</a> <span class="muted">${fmtSize(f.size)}</span></li>`;
    })
    .join("");
  const statusOptions = STATUSES.map(([v, l]) => `<option value="${v}"${v === e.status ? " selected" : ""}>${esc(l)}</option>`).join("");
  const eventRows = events
    .map((ev) => `<li><span class="muted">${esc(brisbane(ev.at))}</span> ${esc(ev.actor)}: ${esc(ev.action)}${ev.detail ? ` <span class="muted">${esc(ev.detail)}</span>` : ""}</li>`)
    .join("");
  const mailto = `mailto:${encodeURIComponent(e.email)}?subject=${encodeURIComponent(`Your enquiry ${e.id}`)}`;

  return page(
    e.id,
    `<p><a href="/admin">All enquiries</a></p>
    <div class="admin-head"><h1>${esc(e.id)}</h1>${statusPill(e.status)}</div>
    <div class="admin-grid">
      <section>
        <h2>${esc(SERVICE_LABELS[e.service] || e.service)}</h2>
        ${safety}
        <p class="pre">${esc(e.description)}</p>
        <table class="kv">${detailRows}</table>
        <h2>Files</h2>
        ${files.length ? `<ul class="files">${fileItems}</ul>` : `<p class="muted">No files uploaded.</p>`}
        <h2>History</h2>
        <ul class="events">${eventRows}</ul>
      </section>
      <aside>
        <h2>Customer</h2>
        <table class="kv">
          <tr><th>Name</th><td>${esc(e.name)}</td></tr>
          <tr><th>Email</th><td><a href="${esc(mailto)}">${esc(e.email)}</a></td></tr>
          <tr><th>Phone</th><td>${e.phone ? `<a href="tel:${esc(e.phone.replace(/[^\d+]/g, ""))}">${esc(e.phone)}</a>` : "-"}</td></tr>
          <tr><th>Prefers</th><td>${esc(e.contact_pref)}</td></tr>
          <tr><th>Received</th><td>${esc(brisbane(e.created_at))}</td></tr>
          <tr><th>Terms</th><td>${esc(e.terms_version || "-")}</td></tr>
        </table>
        <h2>Job</h2>
        <form method="post" class="admin-form">
          <label for="a-status">Status</label>
          <select id="a-status" name="status">${statusOptions}</select>
          <label for="a-quote">Quote</label>
          <input id="a-quote" name="quote_amount" type="text" maxlength="60" value="${esc(e.quote_amount)}" placeholder="e.g. $65 (design $40 + print $25)">
          <label for="a-rev">Approved drawing revision</label>
          <input id="a-rev" name="approved_rev" type="text" maxlength="10" value="${esc(e.approved_rev)}" placeholder="e.g. B">
          <label class="inline"><input type="checkbox" name="paid" value="1"${e.paid ? " checked" : ""}> Paid in full</label>
          <label for="a-notes">Notes (private)</label>
          <textarea id="a-notes" name="notes" rows="6" maxlength="10000">${esc(e.notes)}</textarea>
          <button class="btn" type="submit">Save changes</button>
        </form>
        <details class="danger">
          <summary>Delete this enquiry</summary>
          <form method="post" action="/admin/enquiry/${esc(e.id)}/delete">
            <p>Deletes the enquiry, its history and all uploaded files permanently.</p>
            <label class="inline"><input type="checkbox" name="confirm" value="yes" required> Yes, delete ${esc(e.id)}</label>
            <button class="btn btn-danger" type="submit">Delete permanently</button>
          </form>
        </details>
      </aside>
    </div>`
  );
}

async function update(request, env, id) {
  const e = await env.DB.prepare("SELECT * FROM enquiries WHERE id = ?").bind(id).first();
  if (!e) return page("Not found", "<p>No enquiry with that reference.</p>", 404);
  const form = await request.formData();
  const status = STATUSES.some(([v]) => v === form.get("status")) ? form.get("status") : e.status;
  const next = {
    status,
    quote_amount: String(form.get("quote_amount") || "").trim().slice(0, 60),
    approved_rev: String(form.get("approved_rev") || "").trim().toUpperCase().slice(0, 10),
    paid: form.get("paid") === "1" ? 1 : 0,
    notes: String(form.get("notes") || "").slice(0, 10000),
  };
  const changes = [];
  if (next.status !== e.status) changes.push(`status ${e.status} → ${next.status}`);
  if (next.quote_amount !== e.quote_amount) changes.push(`quote "${next.quote_amount}"`);
  if (next.approved_rev !== e.approved_rev) changes.push(`approved rev "${next.approved_rev}"`);
  if (next.paid !== e.paid) changes.push(next.paid ? "marked paid" : "marked unpaid");
  if (next.notes !== e.notes) changes.push("notes edited");

  if (changes.length) {
    const at = nowIso();
    await env.DB.batch([
      env.DB.prepare("UPDATE enquiries SET status = ?, quote_amount = ?, approved_rev = ?, paid = ?, notes = ?, updated_at = ? WHERE id = ?").bind(
        next.status, next.quote_amount, next.approved_rev, next.paid, next.notes, at, id
      ),
      env.DB.prepare("INSERT INTO events (enquiry_id, at, actor, action, detail) VALUES (?, ?, 'owner', 'updated', ?)").bind(id, at, changes.join("; ")),
    ]);
  }
  return Response.redirect(new URL(`/admin/enquiry/${id}`, request.url).toString(), 303);
}

async function remove(request, env, id) {
  const form = await request.formData();
  if (form.get("confirm") !== "yes") return page("Not deleted", `<p>Tick the confirmation box to delete. <a href="/admin/enquiry/${esc(id)}">Back</a></p>`, 400);
  const { results } = await env.DB.prepare("SELECT r2_key FROM enquiry_files WHERE enquiry_id = ?").bind(id).all();
  if (results.length) await env.UPLOADS.delete(results.map((r) => r.r2_key));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM enquiry_files WHERE enquiry_id = ?").bind(id),
    env.DB.prepare("DELETE FROM events WHERE enquiry_id = ?").bind(id),
    env.DB.prepare("DELETE FROM enquiries WHERE id = ?").bind(id),
  ]);
  return Response.redirect(new URL("/admin", request.url).toString(), 303);
}

async function file(env, fileId, view) {
  const f = await env.DB.prepare("SELECT * FROM enquiry_files WHERE id = ?").bind(fileId).first();
  if (!f) return page("Not found", "<p>File not found.</p>", 404);
  const obj = await env.UPLOADS.get(f.r2_key);
  if (!obj) return page("Missing", "<p>The file record exists but the stored file is missing.</p>", 404);
  const inlineImage = view && ["image/jpeg", "image/png", "image/webp"].includes(f.kind);
  return new Response(obj.body, {
    headers: {
      ...ADMIN_HEADERS,
      "content-type": inlineImage ? f.kind : "application/octet-stream",
      "content-disposition": `${inlineImage ? "inline" : "attachment"}; filename="${f.original_name.replace(/"/g, "")}"`,
      "content-length": String(f.size),
    },
  });
}

async function exportCsv(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, created_at, status, service, name, email, phone, contact_pref, quote_amount, approved_rev, paid, description, details, notes FROM enquiries ORDER BY created_at DESC"
  ).all();
  const cols = ["id", "created_at", "status", "service", "name", "email", "phone", "contact_pref", "quote_amount", "approved_rev", "paid", "description", "details", "notes"];
  // Prefix cells that a spreadsheet would treat as formulas.
  const cell = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [cols.join(","), ...results.map((r) => cols.map((c) => cell(c === "created_at" ? brisbane(r[c]) : r[c])).join(","))].join("\r\n");
  return new Response(csv, {
    headers: {
      ...ADMIN_HEADERS,
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="enquiries-${nowIso().slice(0, 10)}.csv"`,
    },
  });
}

