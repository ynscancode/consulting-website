// Pure grouping helper for the Experience page + its editor
// (tech-lead-20260720T160424Z Item 3, ratified). The category SET is
// entirely data-driven — grouping falls out of whatever distinct
// `category` strings exist on the entries passed in; nothing here
// enumerates a fixed list of categories. Adding a brand-new category to
// the data "just works" with zero changes to this file.
//
// The ONLY category-ish string literal in this file is `OTHER_LABEL`, a
// fallback LABEL for the null-group (entries with an empty/missing
// category) — not a category enumeration.
//
// Used by `src/pages/experience.astro` (public render) and
// `src/components/edit/EditCollection.astro` (BOTH the experience and
// projects branches of the editor render, load-time only, per director
// RULING 2 on the category-reorder batch) — single source of the grouping
// rule, mirroring the `src/lib/eyebrow.ts` single-formatting-site pattern.
//
// `isPinned` (engineering-director RULING 1, category-reorder batch,
// 20260729): a structural flag set true ONLY on the OTHER_LABEL fallback
// group, so callers can tell "is this the pinned, non-reorderable group"
// apart from a genuine user-typed category literally named "Other"
// (both can exist simultaneously — see groupByCategory below) WITHOUT a
// `group.category === OTHER_LABEL` string comparison, which would collide
// with that real category. Purely additive: both existing call sites are
// unaffected by its presence, and no category enum is introduced.
//
// CANONICAL CATEGORY ORDER (tech-lead-20260729T162747 RATIFIED, run 2 —
// supersedes the run-1 implicit-array-order model, whose premise was false
// per KB-0036: a content loader re-keys records into its own store and may
// hand them back in ITS order, so `src/data/{experience,projects}.json`
// array position is an ordering authority for NOTHING public):
//
//   The ONE canonical category order is the persisted, user-authored list
//   at `src/data/site.json` -> `ordering.categoryOrder[<collection>]`,
//   passed in here as the optional `categoryOrder` argument.
//
// First-appearance order still governs, but ONLY for categories absent
// from that list ("unlisted"), which render LAST among the reorderable
// groups (before the pinned group) and are NEVER dropped.
//
// THE LOAD-BEARING INVARIANT: the persisted list is a SORT KEY over groups
// derived from the entries. It can never CREATE a group, never RENAME one,
// and never SUPPRESS one. A name in the list that matches no live category
// therefore has no rendering path at all — it is structurally unable to
// masquerade as current (KB-0014), and every drift case (rename / emptied /
// listed-but-absent / present-but-unlisted) falls out of this for free
// rather than needing special-case code.
//
// `reorderCategory` (re-pointed in run 2): the ONLY function in this
// codebase that permutes category order. It now returns the new ORDER LIST
// (`string[]`) rather than a re-serialized entries array — the entries are
// not touched by a Move at all.
//
// `normalizeCategoryOrder`: the single shared derivation of "what the
// persisted list should be, given the live entries" — used at editor init,
// at write time (which is also the prune), and as the no-op result of an
// invalid move. One derivation, not three copies that drift (KB-0008).

export const OTHER_LABEL = 'Other';

export type CategoryGroup<T> = {
  category: string;
  entries: T[];
  /** True only for the OTHER_LABEL fallback group. See file header. */
  isPinned: boolean;
};

/**
 * Groups `entries` by category, preserving:
 *  - category ORDER = `categoryOrder` (the canonical persisted list) first,
 *    then first-appearance order for any category that list omits
 *  - within-group order = original array order (no date or other sort)
 *
 * Entries whose category (per `getCategory`) is empty/whitespace-only are
 * collected into a single fallback group labeled `OTHER_LABEL`, always
 * rendered LAST regardless of where those entries appear in the input.
 *
 * `getCategory` is a plain accessor rather than a hardcoded `entry.category`
 * read so this one implementation can serve both call sites: the public
 * page's astro:content entries (category at `entry.data.category`) and the
 * editor's flat working entries (category at `entry.category`).
 *
 * `categoryOrder` is OPTIONAL and purely a sort key: omitted (or empty)
 * reproduces the pre-run-2 first-appearance behavior byte-identically,
 * which is exactly the live base case today (no `ordering` entry exists in
 * `site.json` and it is deliberately NOT seeded — KB-0010). Names in it
 * that match no live category are inert; live categories it omits render
 * last among the reorderable groups. It is user-authored ORDERING DATA,
 * never a category registry — nothing here enumerates categories.
 */
export function groupByCategory<T>(
  entries: T[],
  getCategory: (entry: T) => string,
  categoryOrder?: readonly string[]
): CategoryGroup<T>[] {
  const order: string[] = [];
  const byCategory = new Map<string, T[]>();
  const other: T[] = [];

  for (const entry of entries) {
    const category = (getCategory(entry) ?? '').trim();
    if (category === '') {
      other.push(entry);
      continue;
    }
    if (!byCategory.has(category)) {
      byCategory.set(category, []);
      order.push(category);
    }
    byCategory.get(category)!.push(entry);
  }

  const groups: CategoryGroup<T>[] = order.map((category) => ({
    category,
    entries: byCategory.get(category) as T[],
    isPinned: false,
  }));

  if (other.length > 0) {
    groups.push({ category: OTHER_LABEL, entries: other, isPinned: true });
  }

  if (!categoryOrder || categoryOrder.length === 0) return groups;

  // Explicit three-way partition (listed -> unlisted -> pinned), NOT an
  // Array.sort with a sentinel key: no reliance on sort stability, and the
  // `seen` guard renders each group exactly once even if a hand-edited
  // site.json slipped a duplicate name past the server's dedupe.
  const pinned = groups.filter((group) => group.isPinned);
  const reorderable = groups.filter((group) => !group.isPinned);
  const byName = new Map(reorderable.map((group) => [group.category, group]));
  const listed: CategoryGroup<T>[] = [];
  const seen = new Set<string>();
  for (const name of categoryOrder) {
    const group = byName.get(name);
    // A listed name with no live group contributes NOTHING — it can never
    // create or resurrect a group (the load-bearing invariant, drift case c).
    if (group && !seen.has(name)) {
      listed.push(group);
      seen.add(name);
    }
  }
  // Live but unlisted: last among reorderable, before the pinned group,
  // in first-appearance order among themselves. Never dropped (drift case d).
  const unlisted = reorderable.filter((group) => !seen.has(group.category));

  return [...listed, ...unlisted, ...pinned];
}

/**
 * The single shared derivation of "what the persisted category-order list
 * should be, given the live entries and the current list" — the display
 * order of the reorderable (non-pinned) groups, by name.
 *
 * Used at three sites that must never disagree (KB-0008): the editor's
 * init-time normalization of the seed order, the value written back on
 * every Move, and the no-op result of an invalid move. Because it derives
 * from `groupByCategory`, it simultaneously:
 *  - PRUNES names with no live entries (this is the write-time prune; the
 *    read path already ignores them, so correctness never depends on it),
 *  - APPENDS live-but-unlisted categories (fail-soft, never dropped),
 *  - EXCLUDES the pinned OTHER_LABEL group, which is never persisted,
 *    never a move participant, and always renders last.
 */
export function normalizeCategoryOrder<T>(
  entries: T[],
  getCategory: (entry: T) => string,
  order: readonly string[]
): string[] {
  return groupByCategory(entries, getCategory, order)
    .filter((group) => !group.isPinned)
    .map((group) => group.category);
}

/**
 * Pure sibling of `groupByCategory` (tech-lead-20260729T162747 RATIFIED,
 * run 2) — moves an entire category one slot earlier/later relative to its
 * reorderable (non-pinned) neighbours, and returns the resulting canonical
 * ORDER LIST. The entries themselves are never touched or re-serialized: a
 * Move writes only `site.json`'s `ordering.categoryOrder`, which is what
 * keeps a Move a single-area write with no partial-failure surface.
 *
 * The swap is computed against the DISPLAYED order (i.e. `currentOrder`
 * applied via `groupByCategory`), so "up"/"down" always mean what the
 * buttons show. The pinned fallback group (empty-category entries) is
 * excluded from the partition entirely — never a move source, never a
 * destination, never in the returned list, always rendered last.
 *
 * For any invalid move — unknown `category`, the pinned group, or a
 * direction past either end of the reorderable set — returns the
 * NORMALIZED current order (same value `normalizeCategoryOrder` would give),
 * i.e. an unchanged display order. Still fully data-driven: nothing here
 * enumerates categories.
 */
export function reorderCategory<T>(
  entries: T[],
  getCategory: (entry: T) => string,
  currentOrder: readonly string[],
  category: string,
  direction: -1 | 1
): string[] {
  const reorderable = groupByCategory(entries, getCategory, currentOrder).filter(
    (group) => !group.isPinned
  );
  const index = reorderable.findIndex((group) => group.category === category);
  if (index === -1) return reorderable.map((group) => group.category);

  const neighborIndex = index + direction;
  if (neighborIndex < 0 || neighborIndex >= reorderable.length) {
    return reorderable.map((group) => group.category);
  }

  const swapped = reorderable.slice();
  swapped[index] = reorderable[neighborIndex];
  swapped[neighborIndex] = reorderable[index];

  return swapped.map((group) => group.category);
}
