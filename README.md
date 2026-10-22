# Avisé & Co. — Website

Website for Avisé & Co., practical strategy for Singapore small businesses, live at https://avise-co.vercel.app. Public pages (home, what we do, how we work, insights, about, contact), built to the Avisé & Co. design system, plus a private inline content editor at `/edit`.

> **Editor status:** the `/edit` editor still edits the previous personal-site content (`site.json`, `experience.json`, `projects.json`, blog) in the previous design. It hasn't been rebuilt for the Avisé pages yet, so publishing from it doesn't change the public site.

## Tech stack

- **[Astro](https://astro.build)** (static output, no client-side framework). Content lives in JSON data files and Markdown, read through Astro content collections (`src/content.config.ts`) and compiled to static HTML at build time.
- **Vercel** as the deploy target (via `@astrojs/vercel`). Pushing to `master` deploys production. See [`docs/DEVOPS-VERCEL-RUNBOOK.md`](./docs/DEVOPS-VERCEL-RUNBOOK.md).
- **Fonts:** the public site loads Instrument Serif (display) and Newsreader (text) from Google Fonts, per the Avisé & Co. design system. The editor still loads EB Garamond and Literata.
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
├── pages/                     # Routes (see table above)
│   └── dev-repro/             # DEV-only editor harness (?view=), 404s in production
├── data/
│   ├── avise.json             # Public-site content: services, steps, principles, FAQs, insights, self-check
│   ├── site.json              # (Editor only, previous site) hero, about, contact, empty-state text, category order
│   ├── experience.json        # Experience entries
│   └── projects.json          # Project entries
├── content/blog/              # Blog posts as Markdown (created when the first post is added)
├── content.config.ts          # Collection schemas for all of the above
├── layouts/
│   ├── SiteLayout.astro       # Public site: <head>/SEO tags, header, footer
│   └── EditLayout.astro       # Editor (/edit): shell, footer, toolbar slot
├── components/
│   ├── site/                  # Public site parts (SiteHeader, SiteFooter, Receipt, Steps, InsightCard, SelfCheck, …)
│   ├── edit/                  # Editor views, EditHeader, and the editable row/card twins
│   └── EditorHarness.astro    # Editor toolbar (save, undo/redo, preview, publish)
├── styles/
│   ├── avise.css              # Public site: Avisé & Co. tokens and styles
│   ├── tokens.css             # Previous design's tokens (editor only)
│   ├── site.css               # Previous design's styles (editor only)
│   └── editor.css             # Editor chrome; imports tokens + site
├── lib/                       # Shared helpers (Avisé content loader, receipt renderer, editor/GitHub/Vercel plumbing)
└── middleware.ts              # Editor session gate

astro.config.mjs               # Site URL, Vercel adapter
public/                        # Static files (Avisé favicons, about photo)
docs/                          # Editor setup and Vercel runbook
```

The public site's components take plain data as props, and the pages load the data. The editor still renders in the previous design and uses `site.css`'s class names, but it imports no public module (`site/` components, `SiteLayout`): the editable markup is written separately in `edit/`, and `editor.css` inlines `tokens.css` and `site.css`. This is by design, so editor work can't change the public build output.
