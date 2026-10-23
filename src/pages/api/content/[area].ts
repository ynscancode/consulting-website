import type { APIRoute } from 'astro';
import { getFileOnBranch, putFileOnBranch, GitHubApiError } from '../../../lib/github';
import { getRepoRef, getDraftBranch, getWriteToken, COMMIT_AUTHOR } from '../../../lib/gitConfig';
import { aviseSchema } from '../../../lib/aviseSchema';
import { applyEdits, parseEdits, PatchError } from '../../../lib/contentPatch';
import { AVISE_JSON_PATH } from '../../../lib/contentPaths';

export const prerender = false;

// The editor's single write path: field edits to src/data/avise.json on the
// draft branch. The target file is a literal constant, never derived from
// caller input; the edits are applied to the freshly-read draft and the WHOLE
// result is validated against the public site's schema before anything is
// written (KB-0017: this server check is the trust boundary, not the editor).

// Which editor page the edit came from: only labels the commit (and so the
// version-history badge). Never used to pick a file or a path.
const PAGES = ['home', 'services', 'approach', 'insights', 'about', 'contact', 'site'] as const;
type Page = (typeof PAGES)[number];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// Web-standard base64 (not base64url) round-trip, UTF-8 safe — avoids a
// Node-only `Buffer` dependency so this route works on either the Node or
// Edge Vercel runtime.
function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export const POST: APIRoute = async ({ params, request }) => {
  if (params.area !== 'avise') return json(400, { error: 'unknown_area' });

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  let edits;
  try {
    edits = parseEdits(rawBody);
  } catch {
    return json(400, { error: 'validation_failed' });
  }
  const pageParam = (rawBody as { page?: unknown }).page;
  const page: Page = (PAGES as readonly unknown[]).includes(pageParam) ? (pageParam as Page) : 'site';

  const token = getWriteToken();
  const ref = getRepoRef();
  const branch = getDraftBranch();
  // No per-save merge here: the client's once-per-page-load ensureDraft()
  // (src/lib/editor/client.ts) already guarantees the draft branch exists and
  // is master-synced before the first save of the session.

  try {
    const existing = await getFileOnBranch(token, ref, AVISE_JSON_PATH, branch);
    if (!existing) return json(500, { error: 'content_missing' });
    const current = JSON.parse(fromBase64(existing.contentBase64)) as unknown;

    let next: unknown;
    try {
      next = applyEdits(current, edits);
    } catch (err) {
      if (err instanceof PatchError) return json(400, { error: 'validation_failed' });
      throw err;
    }
    const parsed = aviseSchema.safeParse(next);
    if (!parsed.success) return json(400, { error: 'validation_failed' });

    // Write the validated document (not the raw patched one): schema
    // transforms and stripping of unknown keys apply to what's committed.
    const { commitSha } = await putFileOnBranch(token, ref, {
      path: AVISE_JSON_PATH,
      branch,
      contentBase64: toBase64(JSON.stringify(parsed.data, null, 2) + '\n'),
      sha: existing.sha,
      message: `Update ${page} content`,
      author: COMMIT_AUTHOR,
    });
    return json(200, { commitSha });
  } catch (err) {
    console.error('content/avise write failed', err);
    // A retryable GitHub error is a transient blip: the editor shows
    // "retrying" and tries again, rather than a terminal failure.
    if (err instanceof GitHubApiError && err.retryable) {
      return json(503, { error: 'github_unavailable', action: 'retry' });
    }
    return json(502, { error: 'write_failed' });
  }
};
