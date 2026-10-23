// Browser-only helpers for the inline editor UI (src/pages/edit/**).
// Never imported by any public-facing page/component — only by
// src/pages/edit/[...path].astro and src/components/edit/*.astro /
// EditorHarness.astro, all of which are prerender=false and gated by
// src/middleware.ts. See TEAM-BOARD tech-lead-20260715T192159 (frontend
// contract) and senior-backend-dev-20260716T030500 (API contract, CSRF
// delivery via the `csrf_token` cookie).

export type SaveResult = { ok: boolean; commitSha?: string; error?: string; action?: string };

function getCookie(name: string): string | null {
  const escaped = name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1');
  const match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Read the non-httpOnly CSRF cookie minted alongside the session at
 * /api/auth/callback (see src/lib/session.ts CSRF_COOKIE_NAME). */
export function getCsrfToken(): string {
  return getCookie('csrf_token') ?? '';
}

let draftEnsured = false;

/** Server contract (senior-backend-dev-20260717T010600): on a CSRF failure
 * for any mutating /api/** call, the response is HTTP 403,
 * content-type application/json, body { error: "csrf_invalid", action:
 * "reauth" }. Status stays 403 (KB-0017 — server check is the real
 * boundary, this only improves failure UX). When detected, broadcast a
 * page-wide signal so EditorHarness.astro can surface a "log in again"
 * recovery affordance instead of a generic dead-end failure — this fires
 * from every mutating call site below, including ensureDraft(), whose
 * result was previously swallowed silently on a non-ok response. */
function checkReauthNeeded(status: number, data: { error?: string; action?: string } | null): boolean {
  if (status === 403 && data?.error === 'csrf_invalid') {
    window.dispatchEvent(new CustomEvent('editor:reauth-needed'));
    return true;
  }
  return false;
}

async function parseJsonSafe<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export type DraftSyncState = 'created' | 'merged' | 'up-to-date' | 'conflict';

/** Last syncState reported by ensureDraft()'s server call this page load, if
 * any. Exposed so EditorHarness.astro can show a conflict banner without
 * every caller having to thread the return value through. */
export let lastDraftSyncState: DraftSyncState | null = null;

/** Idempotent — safe to call before every first-save-of-session. Only
 * actually hits the network once per page load. Returns the server's
 * reported syncState (senior-backend-dev-20260717T180600 RC1), or null if
 * the call failed or was skipped because a draft was already ensured. */
export async function ensureDraft(): Promise<DraftSyncState | null> {
  if (draftEnsured) return lastDraftSyncState;
  const res = await fetch('/api/draft/ensure', {
    method: 'POST',
    headers: { 'X-CSRF-Token': getCsrfToken() },
  });
  if (res.ok) {
    draftEnsured = true;
    const data = await parseJsonSafe<{ syncState?: DraftSyncState }>(res);
    lastDraftSyncState = data?.syncState ?? null;
    if (lastDraftSyncState) {
      window.dispatchEvent(
        new CustomEvent('editor:draft-sync-state', { detail: { syncState: lastDraftSyncState } })
      );
    }
    return lastDraftSyncState;
  }
  const data = await parseJsonSafe<{ error?: string; action?: string }>(res);
  checkReauthNeeded(res.status, data);
  return null;
}

export async function saveArea(area: string, body: unknown): Promise<SaveResult> {
  await ensureDraft();
  const res = await fetch(`/api/content/${area}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
    body: JSON.stringify(body),
  });
  const data = await parseJsonSafe<{ commitSha?: string; error?: string; action?: string }>(res);
  if (!res.ok) {
    checkReauthNeeded(res.status, data);
    return { ok: false, error: data?.error ?? `http_${res.status}`, action: data?.action };
  }
  return { ok: true, commitSha: data?.commitSha };
}

export type PreviewSyncState = 'synced' | 'already-current' | 'conflict';

export type PreviewResult = {
  previewUrl: string;
  lastCommitSha: string;
  /** The just-synced draft tip that was built. Pass to pollPreviewStatus()
   * as a read-only correlation filter only — never a git ref/path
   * (senior-backend-dev-20260720T052230). */
  targetSha: string;
  /** True only when the server has Vercel API polling configured
   * (VERCEL_API_TOKEN + VERCEL_PROJECT_ID). When false, no per-deployment
   * status is available — callers must fall back to the alias `previewUrl`
   * with honest "~30s" messaging (tech-lead-20260720T051536 graceful
   * degradation). */
  pollable: boolean;
  syncState: PreviewSyncState;
};

/** POST /api/draft/preview — session+CSRF gated, triggers an on-demand
 * preview build. Response contract per senior-backend-dev-20260720T052230.
 * Returns null on failure (caller shows "no draft yet" / retry messaging;
 * never a false "ready"). */
export async function fetchPreview(): Promise<PreviewResult | null> {
  // POST + CSRF token: the endpoint now triggers an on-demand build, so it's
  // a CSRF-checked mutation (see src/pages/api/draft/preview.ts). Mirrors the
  // header + reauth handling of the other mutating calls above.
  const res = await fetch('/api/draft/preview', {
    method: 'POST',
    headers: { 'X-CSRF-Token': getCsrfToken() },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    checkReauthNeeded(res.status, data);
    return null;
  }
  return res.json();
}

export type PreviewStatus =
  | { pollable: false; state: 'UNKNOWN' }
  | { pollable: true; state: 'QUEUED' | 'BUILDING' | 'ERROR' | 'READY'; url?: string };

/** GET /api/draft/preview-status?targetSha=... — session-gated, no CSRF
 * (pure read, mirrors fetchHistory()). Returns null only on an unexpected
 * network/parse failure (the two expected/documented shapes above are both
 * still 200s and returned as-is) — caller should treat null the same as a
 * poll attempt that didn't resolve anything (keep polling / eventually
 * time out), never as a false "ready". */
export async function pollPreviewStatus(targetSha: string): Promise<PreviewStatus | null> {
  const res = await fetch(`/api/draft/preview-status?targetSha=${encodeURIComponent(targetSha)}`);
  if (!res.ok) return null;
  return parseJsonSafe<PreviewStatus>(res);
}

// --- Item 4: version history / revert (tech-lead-20260718T082028 §E) ---

export type CommitSummary = { sha: string; message: string; date: string };

/** One editing session — a run of autosave commits collapsed into one
 * version-history card (tech-lead-20260719T095958 Issue 3, Option A;
 * grouping happens server-side in src/lib/history/sessionGrouping.ts /
 * src/pages/api/draft/history.ts, this is purely the response shape). The
 * session containing draft HEAD is `sessions[0]` (server preserves the
 * commits' newest-first order, and session order follows member order).
 * `commitCount === 1` sessions are a single real commit and should render
 * as a plain non-expandable row (director-approved default,
 * engineering-director-20260719T100312 #3). */
export type HistorySession = {
  /** Newest commit in the session — "Restore this version" target. */
  latestSha: string;
  /** ISO date of the oldest member (session start). */
  startedAt: string;
  /** ISO date of the newest member (session end). */
  endedAt: string;
  commitCount: number;
  /** Distinct area badges across the session's members (collapsed-card
   * badge text), newest-first-seen order. Cosmetic only — see
   * sessionGrouping.ts; never used for any trust decision. */
  areas: string[];
  /** Members, newest-first. Each keeps its own sha/message/date so a
   * per-edit "Restore this edit" can target any individual member via the
   * SAME `revertDraft(sha)` below. */
  commits: CommitSummary[];
};

/** GET /api/draft/history — session-gated, no CSRF (read-only). Returns the
 * last 30 commits on editor-draft (newest first) grouped into sessions, or
 * null on failure (the caller renders the error state, never a
 * false-empty list). */
export async function fetchHistory(): Promise<{ sessions: HistorySession[] } | null> {
  const res = await fetch('/api/draft/history');
  if (!res.ok) return null;
  return parseJsonSafe<{ sessions: HistorySession[] }>(res);
}

export type RevertResult =
  | { ok: true; headSha?: string; revertedPaths?: string[] }
  | { ok: false; error: string };

/** POST /api/draft/revert — session+CSRF gated, body { targetSha } ONLY
 * (KB-0017 — client never sends paths/git-ops, the server re-derives which
 * whitelisted files the commit touched). Error contract: invalid_target
 * (400), unreachable_sha (409), no_content_paths (422), revert_conflict
 * (409), write_failed (502), csrf_invalid (403, handled generically below
 * via the reauth event same as every other mutating call). */
export async function revertDraft(targetSha: string): Promise<RevertResult> {
  const res = await fetch('/api/draft/revert', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
    body: JSON.stringify({ targetSha }),
  });
  const data = await parseJsonSafe<{ headSha?: string; revertedPaths?: string[]; error?: string; action?: string }>(res);
  if (!res.ok) {
    checkReauthNeeded(res.status, data);
    return { ok: false, error: data?.error ?? `http_${res.status}` };
  }
  return { ok: true, headSha: data?.headSha, revertedPaths: data?.revertedPaths };
}

export async function publishDraft(): Promise<{ ok: boolean; conflict?: boolean; commitSha?: string }> {
  const res = await fetch('/api/publish', {
    method: 'POST',
    headers: { 'X-CSRF-Token': getCsrfToken() },
  });
  if (res.status === 409) return { ok: false, conflict: true };
  if (!res.ok) {
    const data = await parseJsonSafe<{ error?: string; action?: string }>(res);
    checkReauthNeeded(res.status, data);
    return { ok: false };
  }
  const data = await res.json();
  return { ok: true, commitSha: data.commitSha };
}

export async function logoutAndRedirect(): Promise<void> {
  const res = await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { 'X-CSRF-Token': getCsrfToken() },
  });
  if (!res.ok) {
    const data = await parseJsonSafe<{ error?: string; action?: string }>(res);
    checkReauthNeeded(res.status, data);
  }
  // Logout always sends the user to '/' regardless of whether the CSRF
  // check on this call itself passed — a failed logout call still means
  // the user wants out of the editor, and a fresh visit re-establishes
  // whatever session state is valid.
  window.location.href = '/';
}

/** Dot-path get/set into a plain object/array tree, e.g. "primaryCta.href"
 * or "paragraphs.1". Array segments are looked up positionally; object
 * segments (including non-numeric map keys used for id-keyed collections)
 * by property name. */
export function getPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = cur[key];
    if (next == null || typeof next !== 'object') {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'retrying' | 'error';

export function statusLabel(status: SaveStatus): string {
  switch (status) {
    case 'idle':
      return 'No changes';
    case 'dirty':
      return 'Editing';
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved to draft';
    case 'retrying':
      // tech-lead-20260718T174921 Design A3: a 503 github_unavailable (or a
      // client-side network throw) is a TRANSIENT upstream blip, not a
      // terminal failure — the banner must say so honestly rather than
      // showing the same red "Save failed" state as a genuine error.
      return "Can't reach GitHub — retrying…";
    case 'error':
      return 'Save failed';
    default:
      return '';
  }
}
