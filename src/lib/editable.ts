import { content, type AviseContent } from './aviseContent';

// Edit-mode hooks for the Avisé & Co. page views. The SAME view components
// render the public pages and the /edit editor; these helpers add the editor's
// data attributes only when the editor route has set `Astro.locals.editing`,
// so public pages render exactly as before. Paths are dot paths into
// avise.json, e.g. "home.hero.headline" or "faqServices.2.a".

type Locals = App.Locals;

export type EditKind = 'text' | 'rich';

/** The content to render: the draft the editor loaded, or the build-time file. */
export function siteContent(locals: Locals): AviseContent {
  return locals.aviseContent ?? content;
}

export function isEditing(locals: Locals): boolean {
  return locals.editing === true;
}

/** Attributes marking an element whose text is the value at `path`. */
export function ed(locals: Locals, path: string, kind: EditKind = 'text'): Record<string, string> {
  return isEditing(locals) ? { 'data-edit': path, 'data-edit-kind': kind } : {};
}

/** Attributes marking a container whose children are the items of the array at `path`. */
export function edList(locals: Locals, path: string): Record<string, string> {
  return isEditing(locals) ? { 'data-edit-list': path } : {};
}

/** Attributes marking one item of the nearest edit list. */
export function edItem(locals: Locals, index: number): Record<string, string> {
  return isEditing(locals) ? { 'data-edit-item': String(index) } : {};
}

/** Internal links stay inside the editor while editing: "/services" -> "/edit/services". */
export function siteLink(locals: Locals, href: string): string {
  if (!isEditing(locals) || !href.startsWith('/')) return href;
  return href === '/' ? '/edit' : '/edit' + href;
}
