// End-to-end checks against a running site.
//   Local:  npm run dev   (in one terminal, with .dev.vars set)   then   npm run smoke
//   Live:   BASE=https://yourdomain.com.au ADMIN_PASSWORD=... npm run smoke
// Creates test enquiries named "Smoke Test" and deletes them at the end.

const BASE = process.env.BASE || "http://127.0.0.1:8787";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test-admin-password-123";
const auth = "Basic " + Buffer.from(`${ADMIN_USER}:${ADMIN_PASSWORD}`).toString("base64");
const testIp = `10.${rand(255)}.${rand(255)}.${rand(255)}`;

let failed = 0;
const created = [];
function rand(n) { return Math.floor(Math.random() * n); }
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && extra ? `  -> ${extra}` : ""}`);
  if (!cond) failed++;
}

const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const STL = new TextEncoder().encode("solid test\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid test\n");

function enquiry(overrides = {}, files = []) {
  const f = new FormData();
  const base = {
    service: "replacement",
    description: "Smoke test: knob with a cracked D-shaft hole",
    fit: "6 mm D shaft, 4.6 across flat",
    sample: "yes",
    quantity: "2",
    material: "pla",
    colour: "black",
    fulfilment: "pickup",
    suburb: "Daisy Hill",
    name: "Smoke Test",
    email: "smoke@example.com",
    contact_pref: "email",
    consent: "yes",
    submission_id: crypto.randomUUID(),
    started_at: String(Date.now() - 20000),
    terms_version: "test",
    source: "google_maps",
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) {
    if (v === null) continue;
    for (const item of [].concat(v)) f.append(k, item);
  }
  for (const [name, bytes] of files) f.append("files", new Blob([bytes]), name);
  return f;
}

async function post(form, ip = testIp) {
  const res = await fetch(`${BASE}/api/enquiry`, { method: "POST", body: form, headers: { accept: "application/json", "cf-connecting-ip": ip } });
  let body = {};
  try { body = await res.json(); } catch {}
  if (body.ok && body.ref && !body.duplicate) created.push(body.ref);
  return { status: res.status, body };
}
const admin = (path, init = {}) => fetch(`${BASE}${path}`, { redirect: "manual", ...init, headers: { authorization: auth, ...(init.headers || {}) } });

// Public pages
for (const p of ["/", "/replacement-parts", "/mounts-enclosures", "/print-from-file", "/cad-design", "/how-it-works", "/faq", "/quote", "/privacy", "/terms", "/robots.txt"]) {
  const r = await fetch(BASE + p);
  check(`GET ${p} is 200`, r.status === 200, r.status);
  if (p === "/") check("home has CSP header", (r.headers.get("content-security-policy") || "").includes("default-src 'self'"));
}
check("unknown page is 404", (await fetch(`${BASE}/no-such-page`)).status === 404);
check("GET /api/enquiry is 405", (await fetch(`${BASE}/api/enquiry`)).status === 405);

// Valid enquiry with files
const sid = crypto.randomUUID();
const ok = await post(enquiry({ submission_id: sid }, [["front photo.jpg", JPG], ["knob.stl", STL]]));
check("valid enquiry accepted", ok.status === 200 && ok.body.ok && /^Q-\d{6}-[A-Z0-9]{4}$/.test(ok.body.ref), JSON.stringify(ok));
const ref = ok.body.ref;

const dup = await post(enquiry({ submission_id: sid }, [["front photo.jpg", JPG]]));
check("resubmission returns same reference", dup.body.ref === ref, JSON.stringify(dup.body));

// Validation
const bad = await post(enquiry({ name: "", email: "not-an-email", consent: null }));
check("missing name/email/consent rejected", bad.status === 400 && bad.body.errors.length >= 3, JSON.stringify(bad.body));
const badType = await post(enquiry({}, [["virus.exe", STL]]));
check("disallowed extension rejected", badType.status === 400 && /accepted file type/.test(badType.body.errors.join()), JSON.stringify(badType.body));
const fakeJpg = await post(enquiry({}, [["fake.jpg", new TextEncoder().encode("<script>alert(1)</script>")]]));
check("fake image rejected by content check", fakeJpg.status === 400 && /doesn't look like/.test(fakeJpg.body.errors.join()), JSON.stringify(fakeJpg.body));
const badQty = await post(enquiry({ quantity: "0" }));
check("quantity 0 rejected", badQty.status === 400);

// CAD-only must not keep print fields
const cad = await post(enquiry({ service: "cad", deliverables: ["step", "drawing"], units: "mm" }));
check("CAD-only enquiry accepted", cad.body.ok, JSON.stringify(cad.body));

// Honeypot
const hp = await post(enquiry({ website: "http://spam.example", name: "Honeypot Bot" }));
check("honeypot gets a fake success", hp.body.ok);
created.pop();

// Admin auth
check("admin without password is 401", (await fetch(`${BASE}/admin`)).status === 401);
check("admin with wrong password is 401", (await fetch(`${BASE}/admin`, { headers: { authorization: "Basic " + btoa("admin:wrong-password-xx") } })).status === 401);
const listRes = await admin("/admin?status=all");
const listHtml = await listRes.text();
check("admin list shows the enquiry", listRes.status === 200 && listHtml.includes(ref));
check("honeypot enquiry was not stored", !listHtml.includes("Honeypot Bot"));
check("admin pages are noindex", (listRes.headers.get("x-robots-tag") || "").includes("noindex"));

// CAD-only detail has no material
const cadHtml = await (await admin(`/admin/enquiry/${cad.body.ref}`)).text();
check("CAD-only stored without material/quantity", cadHtml.includes("Files wanted") && !cadHtml.includes(">Material<") && !cadHtml.includes(">Quantity<"));

// Detail and files
const detailHtml = await (await admin(`/admin/enquiry/${ref}`)).text();
check("detail shows description", detailHtml.includes("cracked D-shaft"));
check("detail shows how they found us", detailHtml.includes("Found us via") && detailHtml.includes("google_maps"));
const fileIds = [...detailHtml.matchAll(/\/admin\/file\/([A-Z0-9]{10})/g)].map((m) => m[1]);
check("detail lists 2 files", new Set(fileIds).size === 2, fileIds.join(","));
const dl = await admin(`/admin/file/${fileIds.find((id) => detailHtml.includes(`/admin/file/${id}">knob.stl`)) || fileIds[0]}`);
check("file download is an attachment", (dl.headers.get("content-disposition") || "").startsWith("attachment"));
check("file not readable without sign-in", (await fetch(`${BASE}/admin/file/${fileIds[0]}`)).status === 401);

// Update requires same origin
const upd = new URLSearchParams({ status: "quoted", quote_amount: "=1+1 $65", approved_rev: "a", notes: "smoke", paid: "1" });
check("admin POST without Origin blocked", (await admin(`/admin/enquiry/${ref}`, { method: "POST", body: upd })).status === 403);
const up2 = await admin(`/admin/enquiry/${ref}`, { method: "POST", body: upd, headers: { origin: new URL(BASE).origin } });
check("admin update saves", up2.status === 303);
const after = await (await admin(`/admin/enquiry/${ref}`)).text();
check("update recorded in history", after.includes("status new → quoted") && after.includes('value="A"'));
const csv = await (await admin("/admin/export.csv")).text();
check("CSV export escapes formulas", csv.includes(ref) && csv.includes(`"'=1+1 $65"`));

// Rate limit (5 per hour per IP; earlier valid posts from this IP count)
const rlIp = `10.200.${rand(255)}.${rand(255)}`;
let last;
for (let i = 0; i < 6; i++) last = await post(enquiry(), rlIp);
check("6th enquiry in an hour is rate limited", last.status === 400 && /Too many/.test(last.body.errors.join()), JSON.stringify(last.body));

// Clean up
for (const r of created) {
  await admin(`/admin/enquiry/${r}/delete`, { method: "POST", body: new URLSearchParams({ confirm: "yes" }), headers: { origin: new URL(BASE).origin } });
}
const gone = await admin(`/admin/enquiry/${ref}`);
check("delete removes enquiry", gone.status === 404);
check("deleted file is gone", (await admin(`/admin/file/${fileIds[0]}`)).status === 404);

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
