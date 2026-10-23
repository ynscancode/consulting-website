// The ONLY content source for /edit/**. Reads the draft branch first, falls
// back to master, and only falls back to the build-time file if GitHub itself
// is unreachable (the toolbar then shows a read-only banner). Reading what the
// editor writes (the draft) is what lets a save be seen reflected back.
//
// ARCH-0005 invariant: this module is imported ONLY by
// src/pages/edit/[...path].astro (prerender=false, session-gated). No public
// page may import it.

import { getFileOnBranch } from './github';
import { getRepoRef, getDraftBranch, getWriteToken, MASTER_BRANCH } from './gitConfig';
import { AVISE_JSON_PATH } from './contentPaths';
import { content as buildContent } from './aviseContent';
import { aviseSchema, type AviseContent } from './aviseSchema';

export type ContentSource = 'draft' | 'master' | 'build';
export type Loaded<T> = { data: T; source: ContentSource };

function fromBase64(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export async function loadAviseJson(): Promise<Loaded<AviseContent>> {
  try {
    const token = getWriteToken();
    const ref = getRepoRef();
    for (const [branch, source] of [
      [getDraftBranch(), 'draft'],
      [MASTER_BRANCH, 'master'],
    ] as const) {
      const file = await getFileOnBranch(token, ref, AVISE_JSON_PATH, branch);
      if (!file) continue;
      const parsed = aviseSchema.safeParse(JSON.parse(fromBase64(file.contentBase64)));
      if (parsed.success) return { data: parsed.data, source };
      // A draft in an older shape (master has moved on, e.g. new fields) is
      // not an error: show master, whose shape the first save brings into the
      // draft when ensureDraft() syncs master in. Never render it half-parsed.
      console.warn(`loadAviseJson: ${AVISE_JSON_PATH} on ${branch} doesn't match the schema`, parsed.error.issues[0]);
    }
    throw new Error(`${AVISE_JSON_PATH} missing or invalid on both branches`);
  } catch (err) {
    console.error('loadAviseJson: GitHub read failed, falling back to build-time content', err);
    return { data: buildContent, source: 'build' };
  }
}
