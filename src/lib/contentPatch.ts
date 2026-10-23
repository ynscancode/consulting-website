// Applies the editor's field edits to a content document. The editor sends
// only what changed, as `{ path, value }` pairs (dot paths into avise.json,
// e.g. "home.hero.lede" or "faqServices"), and the server applies them to the
// freshly-read draft, so two editor tabs on different pages never overwrite
// each other's work with a stale copy of the whole file.
//
// Every path must already exist in the document: an edit can replace a value
// (a string, or a whole list when items are added, removed or moved) but never
// invent a new key. The caller then validates the WHOLE result against the
// schema before writing, which is what bounds the values themselves.

export type FieldEdit = { path: string; value: unknown };

export const MAX_EDITS = 200;
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

export class PatchError extends Error {}

function isContainer(v: unknown): v is Record<string, unknown> | unknown[] {
  return typeof v === 'object' && v !== null;
}

export function parseEdits(body: unknown): FieldEdit[] {
  const edits = (body as { set?: unknown } | null)?.set;
  if (!Array.isArray(edits) || edits.length === 0 || edits.length > MAX_EDITS) throw new PatchError('invalid_edits');
  return edits.map((e) => {
    const path = (e as { path?: unknown } | null)?.path;
    if (typeof path !== 'string' || path.length === 0 || path.length > 300) throw new PatchError('invalid_path');
    return { path, value: (e as { value?: unknown }).value };
  });
}

/** Returns a patched deep copy; throws PatchError on any path that doesn't
 * already exist (or names a prototype key). */
export function applyEdits<T>(doc: T, edits: FieldEdit[]): T {
  const out = structuredClone(doc) as unknown;
  for (const { path, value } of edits) {
    const parts = path.split('.');
    let cur: unknown = out;
    for (let i = 0; i < parts.length; i++) {
      const key = parts[i];
      if (FORBIDDEN.has(key) || !isContainer(cur)) throw new PatchError('invalid_path');
      const exists = Array.isArray(cur)
        ? /^\d+$/.test(key) && Number(key) < cur.length
        : Object.prototype.hasOwnProperty.call(cur, key);
      if (!exists) throw new PatchError('invalid_path');
      if (i === parts.length - 1) {
        (cur as Record<string, unknown>)[key] = structuredClone(value);
      } else {
        cur = (cur as Record<string, unknown>)[key];
      }
    }
  }
  return out as T;
}
