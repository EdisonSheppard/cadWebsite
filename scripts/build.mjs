// Static site build. No dependencies.
// src/site/layout.html + src/site/pages/*.html + site.config.json -> dist/
//
// Page files start with a JSON comment:  <!-- {"title": "...", "description": "...", "path": "/faq"} -->
// Template syntax (in layout and pages):
//   {{ site.businessName }}   escaped value
//   {{{ page.extraHead }}}    raw value
//   {{#if site.abn}} ... {{/if}}   (not nestable)
//   {{#unless site.abn}} ... {{/unless}}

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, cpSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src/site");
const out = join(root, "dist");
const site = JSON.parse(readFileSync(join(root, "site.config.json"), "utf8"));

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "assets"), { recursive: true });
cpSync(join(src, "static"), join(out, "assets"), { recursive: true });

const hash = (f) => createHash("sha256").update(readFileSync(join(src, "static", f))).digest("hex").slice(0, 10);
const build = { v: hash("styles.css") + hash("app.js"), year: new Date().getFullYear() };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lookup = (ctx, path) => path.trim().split(".").reduce((o, k) => (o == null ? undefined : o[k]), ctx);
const truthy = (v) => (Array.isArray(v) ? v.length > 0 : Boolean(v));

function render(tpl, ctx) {
  return tpl
    .replace(/\{\{#if ([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, p, body) => (truthy(lookup(ctx, p)) ? body : ""))
    .replace(/\{\{#unless ([\w.]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_, p, body) => (truthy(lookup(ctx, p)) ? "" : body))
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, p) => String(lookup(ctx, p) ?? ""))
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, p) => {
      const v = lookup(ctx, p);
      if (v === undefined) throw new Error(`Unknown template value: ${p}`);
      return esc(v);
    });
}

// Values derived from config for use in pages
const availableMaterials = site.materials.filter((m) => m.available);
const derived = {
  materialList: availableMaterials.map((m) => m.label).join(", ") || "PLA",
  materialOptions: availableMaterials.map((m) => `<option value="${esc(m.id)}">${esc(m.label)}</option>`).join(""),
  materialTable: site.materials
    .map((m) => `<tr><th scope="row">${esc(m.label)}</th><td>${m.available ? "Available now" : "Coming soon"}</td><td>${esc(m.note)}</td></tr>`)
    .join(""),
  acceptAttr: site.upload.extensions.map((e) => "." + e).join(","),
  extList: site.upload.extensions.map((e) => e.toUpperCase()).join(", "),
};

const layout = readFileSync(join(src, "layout.html"), "utf8");
const nav = [
  ["/replacement-parts", "Replacement parts"],
  ["/mounts-enclosures", "Mounts & enclosures"],
  ["/print-from-file", "Print your file"],
  ["/cad-design", "CAD design"],
  ["/how-it-works", "How it works"],
  ["/faq", "FAQ"],
];

const sitemap = [];
for (const file of readdirSync(join(src, "pages"))) {
  if (!file.endsWith(".html")) continue;
  const raw = readFileSync(join(src, "pages", file), "utf8");
  const m = raw.match(/^<!--\s*(\{[\s\S]*?\})\s*-->\s*/);
  if (!m) throw new Error(`${file}: missing JSON meta comment`);
  const page = { noindex: false, ...JSON.parse(m[1]) };
  const ctx = { site, page, build, derived };
  page.navHtml = nav
    .map(([href, label]) => `<li><a href="${href}"${href === page.path ? ' aria-current="page"' : ""}>${esc(label)}</a></li>`)
    .join("");
  page.fullTitle = page.path === "/" ? `${site.businessName} | ${page.title}` : `${page.title} | ${site.businessName}`;
  page.canonical = site.siteUrl && !page.noindex ? `${site.siteUrl}${page.path === "/" ? "/" : page.path}` : "";
  page.jsonLd = page.path === "/" && site.siteUrl ? jsonLd() : "";
  page.content = render(raw.slice(m[0].length), ctx);
  const html = render(layout, ctx);
  writeFileSync(join(out, file), html);
  if (!page.noindex) sitemap.push(page.path);
}

function jsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: site.businessName,
    description: site.tagline,
    url: site.siteUrl + "/",
    areaServed: ["Logan", "Daisy Hill", "Brisbane"].map((n) => ({ "@type": "City", name: n })),
    address: { "@type": "PostalAddress", addressLocality: "Daisy Hill", addressRegion: "QLD", addressCountry: "AU" },
    ...(site.contactEmail ? { email: site.contactEmail } : {}),
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

// robots + sitemap
writeFileSync(
  join(out, "robots.txt"),
  `User-agent: *\nDisallow: /admin\nDisallow: /api/\n${site.siteUrl ? `\nSitemap: ${site.siteUrl}/sitemap.xml\n` : ""}`
);
if (site.siteUrl) {
  writeFileSync(
    join(out, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      sitemap.map((p) => `  <url><loc>${site.siteUrl}${p === "/" ? "/" : p}</loc></url>`).join("\n") +
      `\n</urlset>\n`
  );
}

// Security and cache headers for static assets (Workers Static Assets _headers file)
const csp = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");
writeFileSync(
  join(out, "_headers"),
  `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000

/assets/*
  Cache-Control: public, max-age=86400
`
);

const count = readdirSync(out).filter((f) => f.endsWith(".html")).length;
console.log(`Built ${count} pages into dist/ (${statSync(out).isDirectory() ? "ok" : "?"})`);
