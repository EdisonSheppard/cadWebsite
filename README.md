# cadWebsite

Website and enquiry system for a small custom parts, 3D printing and CAD business in Logan, Queensland.

- **Public site**: plain HTML/CSS built from `src/site/` into `dist/`, served by Cloudflare Workers Static Assets.
- **Quote form**: `POST /api/enquiry` validates the form, stores uploads in a private R2 bucket, saves the enquiry in D1, and emails you and the customer through Resend.
- **Admin**: `/admin` (password protected) lists enquiries, shows photos and files, and tracks status, quote, approved drawing revision, payment and notes. CSV export for your records.

Quotes, PDF drawing approval and payment are handled by email. See `docs/`.

## Layout

```
site.config.json        business details, prices, materials, upload limits (public, no secrets)
src/site/layout.html    shared header and footer
src/site/pages/*.html   one file per page
src/site/static/        CSS, JS, font, favicon (served at /assets/)
src/worker/             enquiry API and admin
scripts/build.mjs       builds dist/ (runs automatically before deploy)
scripts/smoke.mjs       end-to-end tests
docs/                   drawing standard and email templates
```

## Change something common

| To change | Edit |
|---|---|
| Business name, email, ABN, domain, prices | `site.config.json` |
| Which materials are offered | `materials[].available` in `site.config.json` |
| Page wording | `src/site/pages/<page>.html` |
| Colours and type | variables at the top of `src/site/static/styles.css` |

## Run locally

```bash
npm install
cp .dev.vars.example .dev.vars    # set ADMIN_PASSWORD
npm run dev                        # http://localhost:8787, admin at /admin
npm run smoke                      # in a second terminal
```

Local D1 and R2 are simulated in `.wrangler/`. Nothing touches your live data.

## Deploy

Pushing to `main` deploys through Cloudflare Workers Builds. The D1 database and R2 bucket in `wrangler.jsonc` are created automatically on the first deploy if they don't exist, and the tables are created on first use.

Secrets are set in the Cloudflare dashboard (Worker > Settings > Variables and Secrets) or with `npx wrangler secret put NAME`:

| Secret | Needed for |
|---|---|
| `ADMIN_PASSWORD` | `/admin` (at least 12 characters; admin stays disabled without it) |
| `RESEND_API_KEY` | enquiry emails (also set `emailFrom` and `ownerNotifyEmail` in `site.config.json`) |
| `TURNSTILE_SECRET_KEY` | spam check (also set `turnstileSiteKey`) |
| `IP_SALT` | any random string, used to hash IPs for rate limiting |

Test the live site with `BASE=https://your-domain ADMIN_PASSWORD=... npm run smoke`. It creates test enquiries named "Smoke Test" and deletes them afterwards.

## Privacy

This repository is public. Never commit `.dev.vars`, API keys, customer files, exported CSVs or real customer details. Customer files live only in the private R2 bucket and are served only through `/admin` after sign-in.
