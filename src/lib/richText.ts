// Rich text for Avisé & Co. content: plain text in which `<em>…</em>` marks the
// emphasised phrase of a headline (the design system's one emphasis device).
// Shared by the server render, the browser and the editor.
//
// Safety comes from rendering, not from trusting the stored string: everything
// is HTML-escaped, then only the exact `<em>` / `</em>` tags are restored. A
// stored value can therefore never inject markup, however it got into the
// file.

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** HTML for a rich field. `emClass` adds class="em" for headlines, whose
 * emphasis colour the stylesheet keys off `em.em`. */
export function richHtml(s: string, opts?: { emClass?: boolean }): string {
  const open = opts?.emClass ? '<em class="em">' : '<em>';
  return escapeHtml(s).replace(/&lt;em&gt;/g, open).replace(/&lt;\/em&gt;/g, '</em>');
}

/** The editor's inverse: a contenteditable element's content back to a rich
 * string. Text is kept as-is; <em>/<i> (what Ctrl/Cmd+I inserts) become
 * <em>; any other markup a paste might bring contributes only its text. */
export function richFromNode(node: Node): string {
  let out = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent ?? '';
    } else if (child instanceof HTMLElement) {
      const tag = child.tagName;
      if (tag === 'EM' || tag === 'I') {
        const inner = richFromNode(child);
        if (inner) out += '<em>' + inner + '</em>';
      } else if (tag === 'BR') {
        out += ' ';
      } else {
        out += richFromNode(child);
      }
    }
  });
  return out.replace(/<\/em><em>/g, '');
}
