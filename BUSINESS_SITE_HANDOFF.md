# Business website — GitHub and implementation handover

**Prepared:** 7 November 2026 (Australia/Brisbane) — revised for public GitHub repository
**Project:** Logan / Brisbane custom fabrication and CAD service
**Working brand:** Custom Parts & CAD (placeholder; trading name not confirmed)
**GitHub repository:** [`EdisonSheppard/cadWebsite`](https://github.com/EdisonSheppard/cadWebsite) (**public**; static preview and documentation only)
**Provenance:** Consolidated from the previous business-site development chat and business-service planning document. This file describes the site and a migration path; it is not an export of the original Work backend.

## 1. Current live prototype

- **Public site:** https://parts-review-prototype.sheppardedison.chatgpt.site/
- **Admin route:** https://parts-review-prototype.sheppardedison.chatgpt.site/admin
- The previous Work conversation reported that the admin portal is restricted to the owner's ChatGPT account.
- The previous Work conversation also reported completion of 64 workflow checks. This was not independently verified in this handover.
- **Source-code availability in this session:** Not available. The deployed website cannot be retrieved as a full source bundle from this session, and neither the application database nor backend code has been exported.
- **GitHub publishing status:** The reconstructed static frontend and public handover were committed to `EdisonSheppard/cadWebsite` on 7 November 2026. The original live application source and backend were not available for this export. This repository is public: never commit customer data, private links or secrets.

**Do not confuse the reconstructed static website in `site/` with the deployed prototype.** The static starter is a separate approximation of the marketing pages, not an authenticated, customer-ready replacement.

## 2. Business scope

### Main advertised services

1. Replacement Plastic Parts — suitable non-safety-critical caps, knobs, covers, spacers, brackets etc., recreated from measurements/samples/photos.
2. Custom Mounts & Enclosures — equipment mounts, holders, low-voltage electronics boxes, Raspberry Pi / ESP32 enclosures and adapters.
3. 3D Printing From Your File — customer STL/3MF; confirm units, quantity, suitability and print parameters.
4. CAD Design & Modifications — model from dimensions/sketches, edit suitable source CAD; allow **CAD-only** orders with no print-material requirement.

### Secondary service

- Desktop PC builds, upgrades, cleaning, installation and scoped diagnosis; separate navigation/service page from the main fabrication focus.

### Approved later additions

- Custom electronics prototypes using ready-made modules/development boards; **no custom PCB design/manufacturing**.
- CAD rendering and product visualisation.
- Local measuring and fitting visits by arrangement.
- FDM 3D-printer setup and maintenance for supported models.

### Materials and boundaries

- PLA is the standard assessed material. Offer PETG and TPU as choices only when the actual printing workflow and stock are ready; avoid automatic availability guarantees.
- Original Bambu A1 Mini nominal volume: 180 × 180 × 180 mm, with real fit dependent on orientation and process.
- No professional 3D-scanning service; reverse engineering is measurement-based.
- Exclude safety-critical/structural parts, unvalidated hot-car applications, certified electrical enclosures, food-contact parts without proper processes, and unverified high-temperature applications.
- Quote each project individually; illustrative prices are examples, not a public rate card or accepted contract.

## 3. UX and design direction

- Clean white/off-white and teal design, modern practical workshop aesthetic, consistent rendered-product imagery, clear typography.
- Homepage prioritises replacement parts and the benefits of direct maker contact, useful turnaround on suitable jobs, and individually scoped affordable quotes.
- Mobile-first responsive public pages and clear service-specific call-to-action buttons.
- Dedicated service pages and local search metadata for Logan, Daisy Hill and Brisbane where truthful/relevant.
- Show example projects and clearly mark illustrative quotes as hypothetical until replaced by real examples.
- Public marketing can be static; authenticated administration, uploads, approvals and revisions need a backend.
- Admin panel is private. Never put a working customer database, unprotected customer review links, API keys or private models in a public code repository.

## 4. Quote form requirements

### Always capture

- Customer contact details and preferred contact method.
- Service type and a human-readable description.
- Dimensions/units and intended use, as appropriate.
- Quantity and required ready date.
- Locality and collection/postage preference.
- Photos and uploaded STL, STEP/STP, 3MF, PDF or sketches where supplied; a CAD file is **not mandatory** to enquire.
- Notes, relevant mounting/fit information and expected environment/loads/temperature.

### Adaptive fields

- **CAD-only:** ask deliverable format, model inputs, dimensions, revision needs. **Do not ask for filament type/colour/print finish**.
- **Print-only:** ask model file, scale/units, quantity, material/colour preferences, finish and use environment; keep technical print settings owner-controlled.
- **CAD + print / replacement / mount:** ask design/fit details and physical print options, showing PLA, PETG and TPU only when truly available; include `Please recommend`.
- **PC:** ask hardware/model/problem and privacy/backup considerations, not CAD material options.
- **Visits/rendering/electronics/printer maintenance:** use service-specific questions instead of generic printing settings.

### Data/security

- Do not trust client-provided price, role, status, uploaded file extension, MIME type, or measurements.
- Server-side file-type and size validation, malware screening as appropriate, upload quotas and access controls.
- Explicit privacy/data retention and customer-file/IP terms; scope each stored object to its ticket/customer.
- Rate limiting, anti-spam, CSRF protection where session-based, and server-enforced administrative access.
- Quote pricing is calculated or entered by the owner, not trusted from form data.

## 5. Customer and administrator workflow

1. **Enquiry submitted:** generate ticket, capture contact/brief, attachments and an audit event.
2. **Owner triage:** accept in-scope work, ask questions or decline with a reason. Internal-only notes must never reach customers.
3. **Manual quote:** scope, quantity, CAD vs print, included revisions, material, colour, price (AUD), payment schedule, and estimated ready date. Publish immutable quote revision.
4. **Quote acceptance:** customer explicitly accepts that particular scope and price; record timestamp, identity/verification and quote version.
5. **CAD/file review:** upload separate model revisions; allow customer to view current model through a private, revocable link and request changes.
6. **Approval:** customer approves an exact revision/specification. Any material geometry, quantity, colour, material or price change invalidates prior approval as appropriate.
7. **Payment tracking:** owner can record agreed payments. No card information stored; external hosted payments only once configured.
8. **Production:** use approved model, verify scale/settings; track print, inspection and finishing.
9. **Delivery:** collection or dispatch/tracking and final status.
10. **Closed:** preserve agreed history and provide controlled retention/deletion tooling.

### Admin capabilities described in previous prototype work

- Tickets with status/priority, customer details and attachments.
- Quotes and quote revisions, internal notes, financial/payment status.
- Model files/revisions and customer review link management.
- Design approval and change-request states.
- Fulfilment/dispatch updates and activity history.
- Email notification queue and activity view were added most recently.

The actual implementation details, permissions and DB schema are unknown without the original source export. Do **not** assume these features work identically in another environment.

## 6. 3D model review requirements

- Large responsive model viewer; desktop model+details layout, mobile stacked layout.
- Orbit, pan, zoom, reset/fit; top/bottom/front/back/left/right/isometric standard views.
- Preserve CAD source geometry when measurement accuracy requires BREP/STEP, rather than assuming rendered triangles represent exact analytic surfaces.
- Point-to-point, point-to-plane and parallel planar-face distance; clearly identify accurate/snap-aware vs approximate picking.
- Confirm units, display mm for a verified metric model; protect against scale errors.
- Show owner-highlighted critical dimensions, revision notes, quote scope, material, colour and quantity.
- Private link access must be enforced for **model binaries** too, not just the HTML page.
- Feedback is tied to a precise revision. Approval records should capture customer, timestamp and immutable revision/specification identifier.
- STEP support and accurate measurement tools must be tested against known geometry before production use.

## 7. Notifications and integrations

- The previous Work chat reported an email notification queue/activity feature.
- **Sending was not active** at last report: configure a verified sending domain/address and API key for the chosen provider; test delivery and failure/retry behaviour.
- Payment links can be added only after a real payment provider account is active; don't claim card checkout works before then.
- If hosted on Cloudflare Pages, public frontend hosting is distinct from required server functions, database and private file storage. Choose the backend architecture after exporting/inspecting the original source.

## 8. GitHub migration steps

**Preferred approach:** Export the **original source** from the Work project, rather than scraping the public website (which omits backend, secrets and data schemas).

1. Use the existing **public** GitHub repository `EdisonSheppard/cadWebsite` for reviewed, source-only content. Keep secrets, customer data and private files in appropriately protected systems, outside public Git.
2. Obtain the original application files from the Work project or a proper source export, including server functions and schema/migration files; **never export customer data or secrets in a Git repository**.
3. Review `.gitignore`; remove local `.env`, credential files, private customer uploads, SQLite DB copies, access tokens, session cookies and private links.
4. Keep `.env.example` with placeholder variable names only, not actual secret values.
5. Run build/typecheck/tests and security review locally; verify anonymous access cannot view `/admin`, other customers' files, or quote/approval endpoints.
6. Push source to the new repo. Example after `cd` to the exported project directory:

   ```bash
   git init
   git branch -M main
   git remote add origin https://github.com/EdisonSheppard/cadWebsite.git
   git add .
   git commit -m "Initial business website source export"
   git push -u origin main
   ```

   The remote URL will only work **after** that private repository is created. Because the repository already exists, do not run `gh repo create`. Review the existing branch and use a normal branch/PR for replacing the starter with the exported application.
7. Configure hosting/database/file storage and provider environment variables securely; migrate data only if needed and only using a private, authorised procedure.
8. Test in staging and compare against the live prototype before changing DNS or switching customer traffic.

### Required acceptance checks

- [ ] Public service pages load on mobile and desktop.
- [ ] CAD-only quote requests do not show physical print material.
- [ ] Other print-related quote flows include availability-aware PLA / PETG / TPU.
- [ ] Attachments are validated and private; cannot be accessed by guessing object URLs.
- [ ] Anonymous and customer sessions cannot reach the admin API.
- [ ] Each customer review link accesses only its intended project.
- [ ] A customer cannot approve an obsolete revision after a material change.
- [ ] Quote acceptance, design approval, payment and fulfilment remain separate events.
- [ ] Email queue delivers/recovers reliably after provider is configured.
- [ ] Errors/validation failures never leak secrets or customer data.
- [ ] Backup/retention/deletion and privacy policy are agreed.
- [ ] Live app parity is checked against source-built staging version.

## 9. What is included in this handover ZIP

```text
custom-fabrication-business-site/
├── README.md
├── BUSINESS_SITE_HANDOFF.md
├── .gitignore
└── site/
    ├── index.html
    ├── styles.css
    ├── app.js
    └── assets/
        └── mark.svg
```

The `site/` folder is a newly authored, dependency-free **static marketing-page starter**, with an adaptive **copy-only enquiry draft**. It is intentionally not connected to any customer backend and does not expose a dummy admin login. Files selected in the form are not uploaded. Do not treat this as a production-ready site or claim it replicates the deployed prototype.

## 10. Immediate next step

Create the empty private repository, and export the original Work application's source code or provide a source archive. Once both exist, the actual production application can be committed without touching the existing public portfolio repository.