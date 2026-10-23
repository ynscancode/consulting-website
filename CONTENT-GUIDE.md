# Content Guide (no coding required)

**The easiest way to edit content is the inline editor:** sign in at `/edit` on the live site, click any outlined text and type, then Publish. Setup and usage are in [`docs/EDITOR-SETUP.md`](./docs/EDITOR-SETUP.md).

This guide covers editing the same content **directly in the file**, for when the editor isn't an option. You only edit text; the layout and styling never need touching.

To preview changes locally, run `npx astro dev --background` from the project folder and open `http://localhost:4321` (stop it with `npx astro dev stop`). It reloads automatically when you save. To publish, commit and push to `master`; Vercel deploys automatically.

> If you edit the file by hand, don't have unpublished editor changes waiting on the `editor-draft` branch at the same time. Publish or discard those first so the two don't conflict.

---

## Where everything lives

Every piece of text on the site is in **`src/data/avise.json`**. The build checks the file against `src/lib/aviseSchema.ts`, so a typo in its structure fails the build instead of breaking a page.

| Part of the site | Key in `avise.json` |
|---|---|
| Header button | `header` |
| Footer (call to action, tagline, contact lines, legal line) | `footer` |
| Home page sections | `home` (`hero`, `services`, `selfcheck`, `how`, `insights`) |
| Hero receipt | `heroReceipt` |
| What we do page | `servicesPage`, plus `services` (the three services) and `faqServices` |
| How we work page | `approachPage`, plus `steps` and `principles` |
| Insights page and articles | `insightsPage`, plus `insights` (one entry per article) |
| About page | `aboutPage` (and `principles`) |
| Contact page | `contactPage`, plus `faqContact` |
| Self-check options | `symptoms`, with `areas` and `findings` for the result receipt |

## Rules of the file

- **Keep the keys.** Change the text values, not the names on the left.
- **Italic emphasis in headlines:** wrap the phrase in `<em>…</em>`, e.g. `"We'll tell you <em>straight.</em>"`. That's the only formatting allowed; any other tag shows up as plain text.
- **Article paragraphs:** each insight's `body` is a list of paragraphs. One that starts with `## ` is a subheading.
- **Receipts:** each line is `{ "l": label, "v": value }`; add `"hl": true` to the one highlighted line.
- **Insight ids** become the page address (`/insights/<id>`): lowercase letters, digits and hyphens, and don't change one once it's live.
- **Placeholders** are in `[square brackets]`. Anything with a visible bracket isn't ready.
- There are always exactly three `services` (their `id`s, `profit`, `ops` and `market`, link the self-check to them).
