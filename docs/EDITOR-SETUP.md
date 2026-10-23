# Inline content editor — setup & usage

This document is for **Isaiah (the site owner)**. It covers one-time setup for the
inline content editor and how to use it day to day. It assumes no prior GitHub OAuth
App / API-token experience.

If you're looking for how to edit content *without* the editor (directly in
Markdown/JSON files), see [`CONTENT-GUIDE.md`](../CONTENT-GUIDE.md) instead — that
guide is now superseded for the fields the editor covers (see "What's editable"
below) but still applies to anything not yet exposed in the editor UI.

## 1. What the editor is

The inline editor lets you edit the site's content directly on the live-styled
pages — press ✎, click a heading or paragraph and type, rather than filling out
a separate admin form. It's gated to a single GitHub account (yours) via GitHub OAuth; nobody
else can see or use it. Changes you make are saved to a dedicated git branch (a
"draft"), which gets its own Vercel preview deployment so you can check how a
change looks before it goes live. Nothing reaches the public site until you
explicitly click **Publish**, which merges the draft branch into `master` and
triggers the normal production deploy.

## 2. One-time setup (you need to do this yourself)

Do these once, in order. All values you produce here get set as environment
variables in step 2c.

### 2a. Register the GitHub OAuth Apps

A GitHub OAuth App accepts exactly **one** Authorization callback URL, and the
production site and the draft branch's preview live on different origins. So if you
want to log in on both, register **two** OAuth Apps and repeat these steps for each:

| App | Homepage URL | Authorization callback URL | Vercel environment for its ID/secret |
|---|---|---|---|
| `avise-editor` | `https://avise-co.vercel.app` | `https://avise-co.vercel.app/api/auth/callback` | Production |
| `avise-editor-preview` | `https://avise-git-editor-draft-hottudoggu1.vercel.app` | `https://avise-git-editor-draft-hottudoggu1.vercel.app/api/auth/callback` | Preview (`editor-draft` branch) |

If you only ever log in on production, the first app is enough.

1. Go to **https://github.com/settings/developers** → **OAuth Apps** → **New OAuth App**.
2. Fill in:
   - **Application name:** from the table above.
   - **Homepage URL:** from the table above.
   - **Authorization callback URL:** `{site origin}/api/auth/callback`, from the table
     above. It must match `{PUBLIC_SITE_URL}/api/auth/callback` for the environment
     the app serves, or GitHub rejects the login.
3. Click **Register application**.
4. On the app's settings page: copy the **Client ID** shown at the top — this is
   `GITHUB_OAUTH_CLIENT_ID`.
5. Click **Generate a new client secret**, copy it immediately (GitHub only shows
   it once) — this is `GITHUB_OAUTH_CLIENT_SECRET`.
6. No scopes to configure on the app itself — the editor requests scope
   `read:user` at login time (just enough to read your GitHub username; it never
   reads your repos or private data through this token).

### 2b. Create a fine-grained GitHub Personal Access Token (repo-write access)

This is a **separate** credential from the OAuth App above. The OAuth App only
proves *who you are* (login gate); this token is what the editor's backend uses to
actually commit content changes to the repo on your behalf. Keep it scoped to the
absolute minimum — if it ever leaked, an attacker with a broadly-scoped token could
touch every repo you own, while a correctly-scoped one can only touch this one
repo's file contents.

1. Go to **https://github.com/settings/personal-access-tokens/new** (fine-grained
   tokens).
2. **Resource owner:** your account (`ynscancode`).
3. **Repository access:** "Only select repositories" → select **`ynscancode/consulting-website`** only.
4. **Permissions** → **Repository permissions** → **Contents:** set to **Read and write**.
   Leave every other permission at "No access."
5. Set an expiration (GitHub requires one for fine-grained tokens) and note it
   somewhere — you'll need to regenerate and re-set this env var before it expires,
   or draft saves/publishes will start failing with an auth error from GitHub.
6. Generate the token, copy it immediately — this is `GIT_WRITE_TOKEN`.

*(A GitHub App installation token is the longer-term, more precisely-scoped
upgrade path noted in the architecture, but is not required for this MVP — the
fine-grained PAT above is the supported path today.)*

### 2c. Set the environment variables

Two places need these values:
- **Local dev:** copy `.env.local.example` → `.env.local` (already gitignored) and
  fill in real values, for running the editor against `localhost:4321`.
- **Vercel (production + preview):** set the same variables as Vercel project
  environment variables so the deployed site (and the draft branch's preview
  deployment) can use them.

> **Operational note — Vercel provisioning is out of scope for this document.**
> The exact `vercel env add` commands, which Vercel **environment** (Production /
> Preview / Development) each variable belongs to, and how to read off the actual
> preview-deployment domain pattern for `VERCEL_PREVIEW_URL_TEMPLATE` (needed for the
> preview OAuth App's callback URL in §2a) are the responsibility of the
> **Vercel provisioning runbook at [`DEVOPS-VERCEL-RUNBOOK.md`](./DEVOPS-VERCEL-RUNBOOK.md)**.
> That runbook is the source of truth for the CLI commands — follow it directly
> rather than re-deriving the commands from this table. This document only tells
> you *what* each variable means and *where its value comes from*; see
> `DEVOPS-VERCEL-RUNBOOK.md` for the *how-to-set-it-in-Vercel* step.

| Variable | Purpose | Value / how to get it | Where it's set |
|---|---|---|---|
| `GITHUB_OAUTH_CLIENT_ID` | Identifies your OAuth App to GitHub during login | Copied in §2a step 4 | `.env.local` (dev) + Vercel (each environment gets its own app's ID) |
| `GITHUB_OAUTH_CLIENT_SECRET` | Proves the login request came from your app when exchanging the OAuth code | Generated in §2a step 5 | `.env.local` (dev) + Vercel (server-only — never exposed to the browser) |
| `ADMIN_GITHUB_USERNAME` | The only GitHub login allowed to get an editor session; compared constant-time against the OAuth-resolved user on every login attempt | `ynscancode` | `.env.local` + Vercel |
| `SESSION_SECRET` | HMAC-signs the session cookie, the OAuth `state` cookie, and the CSRF token. Rotating it instantly invalidates every existing session. | Generate a real high-entropy value, e.g. `openssl rand -base64 32`. Never reuse a value across environments. | `.env.local` (own local value) + Vercel (its own value, ideally different from local) |
| `PUBLIC_SITE_URL` | Canonical site origin (no trailing slash) — used to build the OAuth redirect URI and validate absolute URLs server-side | `http://localhost:4321` locally; your production origin (e.g. `https://avise-co.vercel.app`) on Vercel Production | `.env.local` + Vercel |
| `GIT_WRITE_TOKEN` | The fine-grained PAT the backend uses to commit/read/delete content files via the GitHub API | Generated in §2b step 6 | `.env.local` (dev) + Vercel (server-only) |
| `GITHUB_REPO` | `owner/repo` — the single repo the git-write API is allowed to touch | `ynscancode/consulting-website` | `.env.local` + Vercel |
| `DRAFT_BRANCH` | The branch name the editor commits drafts to; Publish merges this into `master` | `editor-draft` (or whatever the devops runbook / repo actually uses — confirm it matches what's configured, since a mismatch means Save/Publish silently target the wrong branch) | `.env.local` + Vercel |
| `VERCEL_PREVIEW_URL_TEMPLATE` *(optional)* | Template for the draft branch's live preview link shown in the editor's **Preview** button, with a `{branch}` placeholder, e.g. `https://avise-git-{branch}-<vercel-scope>.vercel.app` | Devops runbook is the source of truth for the exact pattern — it depends on the Vercel project/team scope. If unset, Preview falls back to a plain GitHub branch URL instead of a real Vercel preview link (still functional, just not a live rendered preview). | Vercel only (not needed locally, since local dev doesn't have preview deployments) |

### 2d. Never commit secrets

`.env.local` is already covered by `.gitignore` (`.env*` is ignored) — don't rename
it to something outside that pattern, and don't paste any of the values above into
a commit, a board note, or a screenshot. `.env.local.example` in the repo root only
ever holds placeholder values — if you ever edit that file, keep it that way.

## 3. Day-to-day usage

1. **Log in:** visit `/api/auth/login?redirect_to=/edit` on the site (e.g.
   `https://avise-co.vercel.app/api/auth/login?redirect_to=/edit`). You'll be
   redirected to GitHub to authorize, then back to the site, landing directly on
   `/edit`. Log in with `ynscancode` — any other GitHub account is rejected (see
   Security notes). (`redirect_to` is optional — visiting plain `/api/auth/login`
   still logs you in, but drops you on the normal public homepage afterward
   instead of the editor; you'd then navigate to `/edit` yourself. Bookmarking the
   `redirect_to=/edit` version is the more convenient entry point.)
2. **The edit view:** the editor is the real site. Every page has an editing
   twin under `/edit`, rendered by the same components from the draft content,
   so it looks exactly like the live page:
   - `/edit` (home), `/edit/services`, `/edit/approach`, `/edit/insights`,
     `/edit/insights/<id>`, `/edit/about`, `/edit/contact`
   - `/edit/history`: version history
   The header and footer links keep you inside the editor.
3. **Edit text in place:** the editor opens looking exactly like the live
   site, and links work as normal so you can move between pages. To change a
   text, press the **✎** button in the toolbar: every editable text gets a
   dashed outline (and every FAQ opens, so the answers can be reached). Click
   the one you want; that single field opens with a solid ring and a caret.
   - **Save** (toolbar, or Ctrl+Enter / Cmd+Enter) writes it to the draft
     straight away and closes it. **Cancel** (or Esc) puts the text back.
   - Only one field is open at a time. Clicking elsewhere does nothing until
     you Save or Cancel, and Preview, Publish and Log out wait too.
   - Enter starts a new line, which shows on the site as a line break.
   - In a headline, select a phrase and press Ctrl+I (Cmd+I on a Mac) to set
     the italic emphasis; that is the only formatting kept. Pasted text arrives
     as plain text.
   - Press **✎** again to stop choosing; the outlines go and FAQs close.

   Every text on the site is editable except the Avisé & Co. wordmark:
   headlines, ledes, labels, button and link text, the header navigation and
   footer, list items, FAQ questions and answers, receipts, the self-check
   options and the contact form's labels.
4. **Lists:** while choosing (after ✎), hover over (or tap) a list item to get
   its toolbar: ↑ ↓ to move it, + to add one after it, ✕ to remove it. In an
   insight's body, "+ H" adds a subheading; on a receipt line, ★ makes it the
   highlighted (citron) line. Adding a whole insight creates its page at
   `/insights/<id>`. List changes save straight away and the page reloads to
   show them; they aren't undo steps.
5. **Texts the page doesn't show** appear in dashed editor-only panels while
   choosing, and are edited the same way:
   - every page: its browser-tab title and search-result description, plus
     the phone menu's "Close" label and the "Skip to content" link;
   - home: each self-check option's suggested fix and area, and the result
     receipt's wording (item counts, the mixed-areas finding, each area's name
     and finding);
   - insights: the text under every card; each insight's page: its sector and
     card colour;
   - contact: the booking times (also editable on the slots themselves), the
     business types and placeholder, the form's error messages,
     the confirmation shown after sending, and the copy-handle messages;
   - about: the photo (upload, replace, remove).

   Some messages contain placeholders in braces, such as `{name}` or `{n}`;
   keep them and they're filled in on the site. The self-check, insight filter
   and booking form don't respond in the editor (their texts are edited
   instead). The booking slots' dates are worked out automatically (the next
   four days, Sundays skipped); only the times are content. Not editable here:
   links, colours and layout. Those are code changes.
6. **Undo / Redo:** step back and forward through your saved field edits
   (Ctrl+Z / Ctrl+Shift+Z work too). Each undo or redo is saved to the draft
   automatically. The history lasts while the browser tab stays open, across
   page changes. The toolbar shows saving, saved, or an error.
7. **Preview:** click **Preview** to build the draft branch's Vercel preview:
   the actual site with your unpublished changes. If nothing has been saved to
   the draft yet, Preview will tell you to save a change first.
8. **Publish:** click **Publish**, confirm the prompt. This merges the draft
   branch into `master`, which triggers the normal production deploy; your
   changes go live once that deploy finishes. If the merge can't complete
   cleanly (a conflict), Publish reports that and nothing is merged.
9. **Log out:** click **Log out** in the toolbar when you're done, especially on
   a shared or unattended machine.

**Where the content lives:** everything the editor changes is in
`src/data/avise.json` on the `editor-draft` branch until you publish. Saves send
only the fields you changed, and the server applies them to the latest draft and
checks the whole file before writing, so two editor tabs on different pages
can't overwrite each other. **Insight addresses (`/insights/<id>`) are fixed**
once created, to keep links working.

## 4. Security notes

- Only the GitHub account named in `ADMIN_GITHUB_USERNAME` (`ynscancode`) can ever
  get an editor session. Anyone else attempting to log in — or anyone hitting
  `/edit/*` without a session at all — sees the same generic "not found" response
  as a genuinely nonexistent page; there is no visible sign the editor exists.
- The two secrets that matter are `GITHUB_OAUTH_CLIENT_SECRET` and
  `GIT_WRITE_TOKEN`. If either is ever exposed (accidentally committed, pasted
  somewhere, or you suspect a leak):
  - **OAuth client secret:** go back to the OAuth App's settings page
    (github.com/settings/developers → your app) and generate a new client secret,
    then update the Vercel env var (and `.env.local` if applicable) and redeploy.
    The old secret stops working immediately once replaced.
  - **Git-write token:** go to
    https://github.com/settings/personal-access-tokens and delete/regenerate the
    fine-grained token, then update `GIT_WRITE_TOKEN` in Vercel and redeploy.
  - If you suspect `SESSION_SECRET` itself leaked, rotate it too — this instantly
    invalidates every active session (including your own; you'll need to log in
    again).
- Content saved through the editor is stored as plain JSON/Markdown data files,
  never as executable page markup — this is a deliberate defense so that even a
  malicious or malformed save can't turn into runnable code on the site.

## 5. Troubleshooting

- **Login redirects back with `?auth_error=1`:** this is a single generic error
  covering several possible causes on purpose (so a would-be attacker can't tell
  *why* a login failed) — most commonly it means you authorized with a GitHub
  account other than `ynscancode`. Log out of that GitHub account (or use a
  private browser window) and retry with the correct one. Other possible causes:
  the OAuth callback URL registered on the GitHub OAuth App doesn't match the
  origin you're logging in from (see §2a — production and preview origins each
  need their own OAuth App), or `GITHUB_OAUTH_CLIENT_ID` /
  `GITHUB_OAUTH_CLIENT_SECRET` don't match what's registered.
- **`/edit` (or any `/edit/*` page) 404s even though you're logged in:** the
  session cookie may have expired (sessions last about 8 hours) — log in again at
  `/api/auth/login`. If it persists, double-check `SESSION_SECRET` is set and
  identical between the app and however it was deployed (a value change
  invalidates all sessions).
- **Preview link doesn't reflect a recent save:** the draft branch's Vercel
  preview deployment has to finish its own build after each commit, same as any
  other deploy — give it a minute and refresh. If it's been longer than a normal
  build takes, check the Vercel dashboard for that branch's deployment status
  (devops runbook covers where to look).
- **Publish fails / reports a conflict (409):** this means the draft branch and
  `master` have diverged in a way that can't be auto-merged (for example, someone
  pushed directly to `master` outside the editor after the draft was created).
  The editor does not attempt to auto-resolve this — resolve it manually in git
  (rebase or recreate the draft branch from current `master`), or ask
  engineering/devops for help; nothing is published until the conflict is
  resolved.
- **A save fails or the toolbar shows an error status:** check that
  `GIT_WRITE_TOKEN` hasn't expired (fine-grained tokens require an explicit
  expiration — see §2b step 5) and that it still has Contents: Read & write on
  `ynscancode/consulting-website`.
