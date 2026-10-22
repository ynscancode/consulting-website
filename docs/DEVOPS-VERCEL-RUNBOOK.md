# Vercel provisioning runbook — inline content editor

Devops-engineer runbook for deploying the inline editor feature (`feat/inline-editor`).
Source of truth for the `vercel env add` commands referenced from
[`EDITOR-SETUP.md`](./EDITOR-SETUP.md) §2c. Config-verification + provisioning only —
no app code in this document.

Project: `consulting-website` (production domain `avise.co`, draft-branch domain `preview.avise.co`), team/scope: `hottudoggu1`, repo: `github.com/ynscancode/consulting-website`,
production branch: `master`, draft branch: `editor-draft` (`DRAFT_BRANCH`). Assumes
`vercel link` has bound this repo checkout to the `consulting-website` project.

## 1. Build/config verification (done, findings below)

Ran `astro build` locally (Astro 7.0.9, `@astrojs/vercel` 11.0.3, local Node v24.15.0)
against `feat/inline-editor` and inspected `.vercel/output`:

- **Static/server split is correct.** `.vercel/output/static/` contains plain HTML for
  all 8 public pages + `rss.xml`. The **only** function is
  `.vercel/output/functions/_render.func` (one Lambda), and `.vercel/output/config.json`
  routes to it *only* for: `/api/auth/{login,callback,logout}`, `/api/content/[area]`,
  `/api/draft/{ensure,preview}`, `/api/publish`, `/edit/**`, plus Astro's own
  `/_server-islands/*` and `/_image` internals, with a catch-all 404 fallback. No public
  page route is server-rendered. This matches tech-lead's "static stays static, only
  `/api/**` + `/edit/**` opt into a function" architecture — confirmed at the build-output
  level, not just by reading `astro.config.mjs`.
- **Runtime: `nodejs24.x`**, read from `.vc-config.json`. `@astrojs/vercel` v11 derives
  this from the Node major version the build runs under (`SUPPORTED_NODE_VERSIONS` table
  in the adapter, `node_modules/@astrojs/vercel/dist/index.js:31-44`) — 24 is currently
  listed `status: "default"`, 22 and 20 are `"available"`, 18 is `"deprecated"`. **This is
  a Vercel-supported runtime, not a config issue.** Two things to keep in sync so
  production builds match this local result:
  - `package.json` already pins `"engines": { "node": ">=22.12.0" }` — consistent with
    the adapter's supported range.
  - **The actual Node version used at deploy time comes from whatever Node the build
    runs under in Vercel's own build environment — controlled by Project Settings →
    General → Node.js Version, not by the local machine or by `vercel.json`.** Confirm
    that dropdown is set to 22.x or 24.x (not 18.x, which the adapter will warn is
    deprecated and silently fall back from). If it's on an older default, bump it —
    this is the one setting most likely to silently drift from what was verified here.
- **No config issue found.** `astro check`/build both clean on this branch as of the
  senior-backend-dev/qa-engineer board notes; this build-output inspection independently
  confirms the static/server split and runtime claims from the architecture spec.

Build artifacts (`.vercel/output/`, `dist/`) were deleted after verification — not
committed, matches `.gitignore` (`dist/`, `.vercel/` already ignored).

## 2. `vercel.json` — not added, and why

Not needed. Two things that might normally justify one:
- **Runtime pinning:** already handled — the adapter writes `runtime` into
  `.vc-config.json` itself at build time (see §1); a `vercel.json` `functions` block
  would not even apply here, because Astro's Vercel adapter deploys via the **Build
  Output API v3** directly (`.vercel/output`), which bypasses Vercel's own
  framework-detection build step that `vercel.json`'s `functions` glob config targets.
  The correct place to override function-level settings for this project (max duration,
  ISR, etc.) is the **adapter's own options** in `astro.config.mjs`
  (`vercel({ maxDuration, isr, ... })` — see `@astrojs/vercel`'s `VercelServerlessConfig`
  type), not `vercel.json`. Not touching `astro.config.mjs` — no evidence of a duration
  problem (see below).
- **Function duration:** the git-write endpoints make 1-3 sequential GitHub REST calls
  each (`draft/ensure`: get-ref + maybe create-ref; `content/[area]`: one PUT; `publish`:
  one merge). These are fast, well under Vercel's default function timeout (10s Hobby /
  15s Pro default). No evidence of timeouts in any board note. **Not adding a
  `maxDuration` override now** — if GitHub API latency ever causes real timeouts in
  practice, the fix is `vercel({ maxDuration: 30 })` in `astro.config.mjs` (an app-config
  change, out of my scope to make speculatively), not a `vercel.json` edit.
- **Function region:** no latency-sensitive requirement stated anywhere in the
  architecture; default region is fine. Region also isn't a `@astrojs/vercel` adapter
  option at all (checked `VercelServerlessConfig` — no `regions` field) — if ever needed
  it's a Project Settings → Functions → Function Region change, not `vercel.json`.

If a genuine need for one of these shows up later, revisit — don't add speculative
config now.

## 3. Environment variable provisioning

All commands below use placeholder `<...>` values — **run these yourself and paste real
values at the interactive prompt** (`vercel env add` prompts for the value; nothing
below sets or contains a real secret). `vercel env add <NAME> <environment...>` accepts
multiple environment targets in one call when the value is identical across them.

### 3a. Vars with the same value in every environment

```
vercel env add ADMIN_GITHUB_USERNAME production preview development
# value: ynscancode

vercel env add GITHUB_REPO production preview development
# value: ynscancode/consulting-website

vercel env add DRAFT_BRANCH production preview development
# value: editor-draft

vercel env add GIT_WRITE_TOKEN production preview
# value: <fine-grained PAT from EDITOR-SETUP.md §2b — Contents R/W, ynscancode/consulting-website only>
# Needed in BOTH production and preview: /edit is prerender=false and ships in every
# deployment, including the draft branch's own preview build, so a save/publish
# initiated from the preview deployment's own /edit UI also needs this token
# server-side there. Server-only either way — never PUBLIC_-prefixed, never sent to
# the client (confirmed by security-engineer's gate + qa-engineer's grep of dist/).

vercel env add VERCEL_PREVIEW_URL_TEMPLATE production preview
# value: https://preview.avise.co
# NOTE: despite the "{branch}" placeholder documented in .env.local.example, this repo
# has exactly one draft branch (editor-draft, fixed by DRAFT_BRANCH). Setting the fully
# resolved URL directly is simpler and correct today; if a second draft branch is ever
# introduced, this needs to become a real template + runtime substitution (app-code
# change, not an env-var change) rather than a second hardcoded value.
```

`GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` are also the **same value in
every environment** — one GitHub OAuth App, not two — see §3b for why, and why they're
listed separately here.

```
vercel env add GITHUB_OAUTH_CLIENT_ID production preview development
# value: <Client ID from the OAuth App registered per EDITOR-SETUP.md §2a>

vercel env add GITHUB_OAUTH_CLIENT_SECRET production preview
# value: <Client secret from the same OAuth App>
```

### 3b. `PUBLIC_SITE_URL` and the OAuth callback — differs per environment, and why

This is the one genuinely environment-sensitive pair. The OAuth redirect URI the
backend builds is `{PUBLIC_SITE_URL}/api/auth/callback`, and it must match a callback
URL actually registered on the GitHub OAuth App, or GitHub rejects the login attempt
before it ever reaches this app's code.

- **Production:** `PUBLIC_SITE_URL=https://avise.co`
- **Preview:** `PUBLIC_SITE_URL=https://preview.avise.co`
  — a custom domain assigned to the `editor-draft` git branch (Project → Settings →
  Domains → add `preview.avise.co` → Git Branch: `editor-draft`), so it always serves
  the latest draft deployment. Use this, **not** the random per-deployment-hash
  preview URL, which changes on every push and can't be pre-registered as an OAuth
  callback.

```
vercel env add PUBLIC_SITE_URL production
# value: https://avise.co

vercel env add PUBLIC_SITE_URL preview --git-branch editor-draft
# value: https://preview.avise.co
```

**Why `--git-branch editor-draft` and not a plain `preview` scope:** a Vercel env var
set on the bare `preview` environment applies to **every** preview deployment for
**every** branch/PR in this repo, not just `editor-draft`. If `PUBLIC_SITE_URL` were set
to the `editor-draft` alias at the plain `preview` scope, any *other* branch's preview
deployment (a normal feature-branch PR preview, unrelated to the editor) would also pick
up that value, causing its `/edit` route's OAuth redirect to point at the
`editor-draft` origin instead of its own — either a broken login on that unrelated
preview or, worse, a session minted against the wrong origin. Scoping the override to
`--git-branch editor-draft` (Vercel CLI/dashboard support per-branch preview env var
overrides) means the editor-specific value only ever applies to the one preview
deployment that's actually meant to host the editor. **Verify the exact flag name
against your installed `vercel` CLI version** (`vercel env add --help`) — if the CLI
version in use doesn't support `--git-branch`, set this override from the Vercel
dashboard instead: Project → Settings → Environment Variables → add `PUBLIC_SITE_URL`
→ Preview → "Custom Environment" / branch-specific override for `editor-draft`.
Same reasoning applies if you also want to scope `GITHUB_OAUTH_CLIENT_ID/SECRET` this
tightly, though it matters less there since their value doesn't change per branch.

**GitHub OAuth App callback URLs to register (EDITOR-SETUP.md §2a):**
```
https://avise.co/api/auth/callback
https://preview.avise.co/api/auth/callback
```
GitHub OAuth Apps support multiple registered callback URLs on a single app (confirmed
— this is not a fine-grained-PAT/GitHub-App-only feature), so **one** OAuth App with
both URLs registered is correct; no need for two separate OAuth Apps or two sets of
`GITHUB_OAUTH_CLIENT_ID`/`SECRET`.

### 3c. `SESSION_SECRET` — generate distinct values per environment

```
openssl rand -base64 32   # run once for production
openssl rand -base64 32   # run again for preview — do not reuse the production value

vercel env add SESSION_SECRET production
vercel env add SESSION_SECRET preview
```

Not required for correctness — `__Host-session` is origin-scoped by the cookie prefix
itself (no `Domain` attribute, `Secure`, `path=/`), so a session minted on the preview
origin is never sent to the production origin regardless of whether the HMAC secret
matches. Recommended anyway as isolation: if the preview secret is ever weaker-handled
or logged, a distinct value keeps that from also invalidating/forging production
sessions. Rotating either value immediately invalidates all sessions signed with it
(matches EDITOR-SETUP.md §4's rotation guidance).

### 3d. Local development

Not a Vercel env var step — copy `.env.local.example` → `.env.local` (already
`.gitignore`d) per EDITOR-SETUP.md §2c and fill in real values there for
`astro dev`/`vercel dev`. `PUBLIC_SITE_URL=http://localhost:4321` locally; GitHub OAuth
Apps also accept `http://localhost:*` as a registered callback if local OAuth testing
is wanted, as a third entry alongside the two in §3b (optional, only if doing local
OAuth testing rather than testing purely against Preview).

## 4. Preview/publish deploy mechanics — confirm these in Vercel before relying on them

1. **Branch deployments must actually be enabled for `editor-draft`.** By default
   Vercel's GitHub integration builds a Preview deployment for every push to every
   branch in the connected repo. Check Project → Settings → Git that nothing narrows
   this (no "Ignored Build Step" script that skips based on branch name, no branch
   allow-list). The draft branch is created and pushed to via the **GitHub Contents/Git
   API** (not a local `git push`) — this still fires a normal GitHub `push` webhook
   event, which Vercel's integration listens to the same way regardless of how the push
   was made, so no special-casing should be needed, but this hasn't been exercised
   live in this task (no write credentials in this sandbox) — flag for qa-engineer/user
   to confirm the first real `draft/ensure` call actually produces a visible Preview
   deployment in the Vercel dashboard.
2. **Preview URL pattern the editor's "Preview" button should resolve to:**
   `https://preview.avise.co` (the draft branch's custom domain,
   same value as `VERCEL_PREVIEW_URL_TEMPLATE`/`PUBLIC_SITE_URL` preview above) — this
   updates in place on every new commit to `editor-draft`, so the same link stays valid
   across saves; no need to look up a per-commit preview URL.
3. **Publish (draft → master merge) triggers the existing production deploy** — no
   separate setup needed. `POST /api/publish` performs a normal GitHub merge of
   `editor-draft` into `master` via the API; that's a regular push to `master`, and
   Vercel's Production Branch build (already configured, this is the pre-existing
   deploy pipeline) fires exactly as it would for any other push to `master`. Nothing
   editor-specific to configure here.
4. **Node.js Version project setting** (see §1) — confirm 22.x or 24.x, applies to both
   Production and Preview builds identically (it's a project-wide setting, not
   per-branch).

## 5. Risks / things flagged for the user

- **`PUBLIC_SITE_URL`/OAuth-callback mismatch is the main failure mode to watch.** If
  the `editor-draft` branch is ever renamed, or a second draft branch is introduced, ALL
  of: the OAuth App's second callback URL, `PUBLIC_SITE_URL` (preview scope),
  `VERCEL_PREVIEW_URL_TEMPLATE`, and `DRAFT_BRANCH` need to move together. None of these
  are derived from each other automatically — a partial update (e.g. `DRAFT_BRANCH`
  changed but the OAuth callback left stale) breaks login on the preview deployment
  with the same generic `?auth_error=1` as any other auth failure (by design, per
  KB-0007 — but that also means this specific misconfiguration is indistinguishable
  from "wrong GitHub account" at the UI level; check env vars first if login suddenly
  fails only on preview, not production).
- **Vercel's `--git-branch` preview-env-var scoping (§3b) is what prevents the editor's
  preview config from leaking onto unrelated PR previews** — if that scoping is skipped
  (e.g. set at the bare `preview` level instead), other preview deployments in this repo
  would inherit `PUBLIC_SITE_URL=<editor-draft alias>`, which is wrong for them. Low
  practical risk on a personal single-owner site with no other active branches today,
  but worth getting right before this becomes a habit.
- **`GIT_WRITE_TOKEN` is a fine-grained PAT with an explicit expiration (GitHub
  requires one).** No automatic renewal/alerting exists — the day it expires, every
  save/publish call starts failing with a GitHub auth error until it's manually
  regenerated and re-set (EDITOR-SETUP.md §5 already documents this as a
  troubleshooting entry). Devops/user should note the expiration date somewhere they'll
  actually see before it lapses; not something Vercel or this runbook can automate
  without a GitHub App (the longer-term upgrade path tech-lead already flagged as
  out of MVP scope).
- **Node.js Version project setting drift (§1):** if it's ever changed to 18.x (or the
  Vercel default changes under it), the adapter will still build successfully but emit
  a deprecation warning in build logs — not a hard failure, but worth someone noticing
  rather than discovering via a warning nobody read.
- **Not verified live in this task** (no write credentials in this sandbox, consistent
  with every other role's caveat on this feature): an actual `editor-draft` push
  producing a real Vercel Preview deployment, an actual OAuth round trip against the
  registered callback URLs, and an actual `/api/publish` merge triggering a real
  production build. These are the concrete residual items for whoever runs the first
  live end-to-end pass after env vars are set.
