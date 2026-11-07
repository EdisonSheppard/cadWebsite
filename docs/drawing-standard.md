# Approval drawing standard

Every job with design work gets a PDF drawing before anything is printed. The customer approves a specific revision letter, and only that revision gets made.

## Fusion drawing template (set up once)

Create a drawing template in Fusion (Drawing > From Design > save as template) with this title block:

| Field | Example | Notes |
|---|---|---|
| Business name | Custom Parts & CAD | Match `businessName` in `site.config.json` |
| Ticket | Q-261107-9AVT | The enquiry reference from the website |
| Part | Replacement control knob | Plain-English name the customer will recognise |
| Revision | A | A, B, C... New letter for **any** change after a drawing has been sent |
| Date | 2026-11-07 | Date the revision was issued |
| Units | mm | Always state it |
| Scale | 2:1 | Scale on the sheet, so a printed copy can be checked |
| Material / colour | PLA, black | What will actually be printed |
| General tolerance | FDM ±0.3 mm unless stated | Sets expectations for non-critical dimensions |
| Approval line | To approve, reply "Approved Rev A" | Tells the customer exactly what to do |

Sheet size A4 landscape. It's what customers will print or view on a phone.

## What goes on each drawing

1. **Two or three views**: usually front, side and one isometric. No more than needed.
2. **Only the fit-critical dimensions.** Shaft and hole sizes, hole spacing, overall envelope, mating faces, clearances. Not every fillet.
3. **Highlight the fit-critical dimensions** in yellow (or boxed). The customer should check those against their part.
4. **Note assumptions** in a short notes block, e.g. "Shaft measured from photo, fit test included" or "Screw holes sized for M3 heat-set inserts".
5. **Fit type** where it matters: "slip fit", "press fit", "clearance for M4 bolt".

## File naming and sending

- File name: `Q-261107-9AVT_RevA.pdf`
- Send it by email, replying in the same thread as the quote so the history stays together.
- Record the revision you sent in the admin notes ("Rev A sent 7/11").

## Approval rules

- Approval must name the revision: "Approved Rev B". "Looks good" → reply asking them to confirm "Approved Rev B".
- When they approve, set the **Approved drawing revision** field in admin, and set status to **Drawing approved**.
- **Any** change after approval (dimension, material, colour, quantity) means a new revision letter and a new approval.
- Before printing, check the file you're slicing matches the approved revision. Keep the Fusion version history; name the version "Rev B approved".
- CAD-only jobs: approval means "send me the files", not "print it". Send files after payment.

## Archive

Keep each sent PDF in a folder per ticket (e.g. on your own drive or Google Drive, `Jobs/Q-261107-9AVT/`). Don't put customer files in the GitHub repo. It's public.
