# Site redesign — handoff brief

Redesign of isaiah-ho.vercel.app (Astro, hosted on Vercel). `design-reference.html` in this folder is the approved design as one standalone page: open it in a browser, and treat its CSS tokens, class structure and copy as the source of truth. Port it into the existing Astro project; don't paste the file in as-is.

## Look in one line
Editorial and warm: two serifs, an oxblood floor top and bottom, off-white paper for the body, apricot only for actions and one italic phrase. Premium, not corporate. No gradients, no monospace, no spaced capitals, no emoji, nothing tilted.

## Tokens
| Token | Value | Use |
|---|---|---|
| `--floor` | `#4F1D23` oxblood | Hero, contact and footer ground; active filter chip; the dash before experience bullets |
| `--ink` | `#1B1718` | Body text; ground of the Writing band |
| `--ink-2` | `#3B3537` | Secondary body text on paper |
| `--muted` | `#5F5759` | Labels, captions, dates on paper |
| `--paper` | `#F3F0EA` | Page ground; text on dark grounds; Now card |
| `--paper-muted` | `#D9CFC9` | Secondary text on oxblood |
| `--card` | `#FFFFFF` | Project cards, open experience row |
| `--line` | `#DAD4CB` | Hairlines on paper |
| `--line-dark` | `rgba(243,240,234,.22)` | Hairlines on dark grounds |
| `--accent` | `#EDB27C` apricot | Primary pill buttons; the italic phrase in headlines on dark grounds; "Draft" labels. **Never as text on paper.** |

Fonts (Google Fonts): **EB Garamond** 400 + italic for display (wordmark, headlines, roles, card titles, Now heading). **Literata** (opsz 7..72) 400/500 + italic for everything people read. No third family.

## Type rules
- Section eyebrow: 16px italic, sentence case, `--muted`.
- Section heading: EB Garamond 400, `clamp(36px, 4.4vw, 52px)`, line-height 1.02.
- Hero h1: EB Garamond 400, `clamp(46px, 6.4vw, 86px)`, line-height 1, max 15ch.
- Emphasis: one italic phrase per headline at most, in `--accent`, only on dark grounds (hero, Writing, Contact). Section headings on paper have no emphasis.
- Dates use `font-variant-numeric: tabular-nums`.

## Components
- **Header**: name as an EB Garamond wordmark (30px) left, anchor nav right; hairline below. Lives on the oxblood ground.
- **Hero**: live Singapore clock eyebrow, h1, lede, then three actions: "Say hello" (apricot pill, mailto), LinkedIn (outline pill), Résumé text link.
- **Now card**: square paper sheet with `0 18px 40px rgba(0,0,0,.32)` shadow, a 2px oxblood rule under the heading, a `<dl>` of italic labels and values. The only shadowed element on the page.
- **Experience ledger**: groups (Work, Leadership, Education). Each row is a `<button aria-expanded>` with dates, role (EB Garamond 26px) + italic org, one-line summary, and a +/– ring. One row open at a time; JLL open on load. Open row becomes a white card with a 1px inset line. Rows without bullets are disabled with no ring.
- **Project cards**: white, 1px line border, 8px radius; italic "status, year" meta, EB Garamond 30px title, description, italic tags under a soft rule. Filter chips (All / Building / Case work) use `aria-pressed`; active chip is oxblood.
- **Writing band**: full-width ink ground, intro left, list of draft titles right with apricot italic "Draft".
- **Contact**: oxblood ground, big headline with italic phrase, email as apricot pill, LinkedIn outline pill; footer under a dark hairline.
- **Buttons**: pills, min-height 44px+. Hover underlines the label; colours don't change.
- **Focus**: 2px solid ring offset 3px; ink on light grounds, apricot on dark.

## Layout and responsive
- Content max-width 1120px; gutters `clamp(20px, 5vw, 48px)`.
- Everything wraps with flex-wrap or `grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))`; the only media query drops the bullet indent under 720px.
- Check at 375px, 768px and 1440px.

## Structure decisions to confirm with Isaiah before changing routes
- The design puts every section on the homepage with anchor links.
- The existing site has /about, /experience, /projects, /blog, /contact and /experience/<entry> detail pages. Suggested: make the homepage the single page above, keep /blog for real posts later, and redirect the other routes to their anchors. **Ask before deleting anything.**
- Keep existing meta tags; update the description to match the new hero copy.

## Content
- All copy is in `design-reference.html`. Text in [square brackets] is a placeholder for Isaiah to fill: photo, current book, Waikiki and Frisbee bullets, board game title, Ho Bee Land result, résumé PDF.
- The profile photo already exists in the repo (used on the current About page); wire it into the About figure.
- Keep content in a data file (e.g. `src/data/experience.ts`, `src/data/projects.ts`) so rows and cards render from arrays.

## Accessibility
- Real buttons and links only; `aria-expanded` + `aria-controls` on experience rows; `aria-pressed` on filter chips.
- Text contrast is at least 4.5:1 in every pairing listed above; don't introduce new pairings without checking.
