# Avisé & Co. — Website

Website for Avisé & Co., practical strategy for Singapore small businesses, live at https://avise-co.vercel.app. Public pages (home, what we do, how we work, insights, about, contact), built to the Avisé & Co. design system, plus a private inline content editor at `/edit`.

The editor at `/edit` is the live site itself: the same page components render from the draft content with every piece of text editable in place (see [`docs/EDITOR-SETUP.md`](./docs/EDITOR-SETUP.md) §3).

## Tech stack

- **[Astro](https://astro.build)** (static output, no client-side framework). All content lives in one JSON file (`src/data/avise.json`), validated at build time and compiled to static HTML.
- **Vercel** as the deploy target (via `@astrojs/vercel`). Pushing to `master` deploys production. See [`docs/DEVOPS-VERCEL-RUNBOOK.md`](./docs/DEVOPS-VERCEL-RUNBOOK.md).
- **Fonts:** Instrument Serif (display) and Newsreader (text) from Google Fonts, per the Avisé & Co. design system, on the site and in the editor.
- **Inline editor** (`/edit`, GitHub OAuth, server-rendered): edits are saved to an `editor-draft` branch and published by merging into `master`. See [`docs/EDITOR-SETUP.md`](./docs/EDITOR-SETUP.md).

**If you're here to edit content rather than code, use the editor ([`docs/EDITOR-SETUP.md`](./docs/EDITOR-SETUP.md)), or see [`CONTENT-GUIDE.md`](./CONTENT-GUIDE.md) for editing the files directly.**

## Local dev quickstart

Requires Node.js 22.12 or newer.

```sh
npm install                  # one-time: install dependencies
npx astro dev --background   # start the dev server at http://localhost:4321 in the background
npx astro dev stop           # stop it (also: astro dev status, astro dev logs)
npm run build                # build the production site
npm run preview              # serve the build locally
```

There is no test suite and no linter configured. `npx astro check` type-checks the project.

## Routes

| Route | What it is |
|---|---|
| `/` | Home: hero receipt, services, self-check, how we work, latest insights |
| `/services` | What we do (anchors `#svc-profit`, `#svc-ops`, `#svc-market`), pricing FAQ |
| `/approach` | How we work: five steps and principles |
| `/insights`, `/insights/<id>` | Insights with sector filter, and one page per analysis |
| `/about` | About |
| `/contact` | Free-consult booking form (prototype: requests are not sent anywhere yet) |
| `/edit/**`, `/api/**` | Inline editor and its API (sign-in required; returns 404 otherwise) |

## Project structure

```
src/
├── pages/                     # Routes (see table above); each page is a thin wrapper around a view
├── data/
│   └── avise.json             # All site content: page copy, services, steps, FAQs, insights, receipts, footer
├── layouts/
│   ├── SiteLayout.astro       # Public site: <head>/SEO tags, header, footer
│   └── EditLayout.astro       # Editor (/edit): same header/footer, plus toolbar and editor styles
├── components/
│   ├── site/
│   │   ├── views/             # One view per page (HomeView, ServicesView, …), used by the site AND the editor
│   │   └── …                  # SiteHeader, SiteFooter, Receipt, Steps, InsightCard, SelfCheck, Faq, Principles
│   ├── edit/EditHistory.astro # Editor version-history view
│   └── EditorHarness.astro    # Editor toolbar (save, undo/redo, preview, publish)
├── styles/
│   ├── avise.css              # Avisé & Co. tokens and styles (site and editor)
│   └── editor.css             # Editor-only chrome (edit outlines, list controls, toolbar, history)
├── lib/
│   ├── aviseSchema.ts         # Schema for avise.json (build and editor saves)
│   ├── editable.ts            # Edit-mode hooks the views add only inside the editor
│   ├── richText.ts            # Headline emphasis: only <em> survives rendering
│   ├── editor/surface.ts      # In-page editing: fields, lists, saves
│   └── …                      # Receipt renderer, draft loader, GitHub/Vercel plumbing
└── middleware.ts              # Editor session gate

astro.config.mjs               # Site URL, Vercel adapter
public/                        # Static files (Avisé favicons, about photo)
docs/                          # Editor setup and Vercel runbook
```

Every page renders from `src/data/avise.json` through a view component in `components/site/views/`. The editor renders the same views with the draft content and `Astro.locals.editing` set, which makes `lib/editable.ts` add `data-edit` hooks; without it the hooks render nothing, so the public HTML is unaffected.
