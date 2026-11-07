# Custom Parts & CAD — website starter

Public source repository for the Logan / Brisbane custom fabrication, 3D printing, and CAD website.

> **Important:** This is a reconstructed **static frontend preview**, not an export of the original Work-hosted business app. The quote form only copies a draft to the clipboard. It does **not** send enquiries, upload files, or store customer information. There is no working administrator portal, customer login, database, approval flow, or backend in this repository.

## Preview locally

```bash
cd site
python3 -m http.server 8000
```

Visit `http://localhost:8000`.

## Files

- `site/index.html` — responsive public marketing and example service pages, including adaptive quote-form preview.
- `site/styles.css` — white/teal visual styling, layouts and responsive rules.
- `site/app.js` — quote form preview logic. CAD-only enquiries never ask for print material.
- `site/assets/mark.svg` — placeholder mark.
- `BUSINESS_SITE_HANDOFF.md` — project scope, workflows, risks and a roadmap to a real backend.
- `.gitignore` — common development and secret/data exclusions.

The starter uses no build tools or dependencies. For Cloudflare Pages, use `site` as the output directory.

## Before going live

1. Export the original application source from the Work project if its working backend and administration features are to be preserved.
2. Implement and test authenticated admin APIs, secure upload storage, ticket management, private model review, quote/revision approval and notifications.
3. Add correct branding, business contact details, applicable terms/privacy details and real portfolio images.
4. Verify availability before advertising PLA/PETG/TPU printing choices.
5. Never commit customer names, emails, enquiry data, private 3D models, tokens, credentials, `.env`, or generated customer review URLs into this **public** repository.

The separate Work-hosted prototype is at https://parts-review-prototype.sheppardedison.chatgpt.site/ . It is not deployed from this repository.
