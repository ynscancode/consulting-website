// Text for Avisé & Co. content, shared by the server render, the browser and
// the editor. Plain text fields may contain line breaks ("\n"), shown as
// <br>. Rich fields are plain text in which `<em>…</em>` marks the emphasised
// phrase of a headline (the design system's one emphasis device).
//
// Safety comes from rendering, not from trusting the stored string: everything
// is HTML-escaped, then only the exact `<em>` / `</em>` tags are restored. A
// stored value can therefore never inject markup, however it got into the
// file.

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** HTML for a plain text field: escaped, with line breaks kept. */
export function textHtml(s: string): string {
  return escapeHtml(s).replace(/\n/g, '<br>');
}

/** HTML for a rich field. `emClass` adds class="em" for headlines, whose
 * emphasis colour the stylesheet keys off `em.em`. */
export function richHtml(s: string, opts?: { emClass?: boolean }): string {
  const open = opts?.emClass ? '<em class="em">' : '<em>';
  return textHtml(s).replace(/&lt;em&gt;/g, open).replace(/&lt;\/em&gt;/g, '</em>');
}

/** Fills "{name}"-style placeholders in an editable message. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? values[key] : m));
}

const BLOCKS = new Set(['DIV', 'P', 'LI']);

/** The editor's reading of a plain text field: its text with line breaks.
 * Browsers mark typed line breaks as <br> or wrap new lines in <div>s. */
export function textFromNode(node: Node): string {
  return walk(node, false).replace(/\n+$/, '');
}

/** The editor's inverse: a contenteditable element's content back to a rich
 * string. Text is kept as-is; <em>/<i> (what Ctrl/Cmd+I inserts) become
 * <em>; any other markup a paste might bring contributes only its text. */
export function richFromNode(node: Node): string {
  return walk(node, true).replace(/\n+$/, '').replace(/<\/em><em>/g, '');
}

function walk(node: Node, rich: boolean): string {
  let out = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent ?? '';
    } else if (child instanceof HTMLElement) {
      const tag = child.tagName;
      if (tag === 'BR') {
        out += '\n';
      } else if (rich && (tag === 'EM' || tag === 'I')) {
        const inner = walk(child, rich);
        if (inner) out += '<em>' + inner + '</em>';
      } else {
        if (BLOCKS.has(tag) && out && !out.endsWith('\n')) out += '\n';
        out += walk(child, rich);
      }
    }
  });
  return out;
}
