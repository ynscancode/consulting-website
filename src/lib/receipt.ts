// Till-receipt markup for the Avisé & Co. public site. One renderer shared by
// the server (set:html in Receipt.astro) and the browser (self-check, booking
// confirmation), so a receipt looks the same however it was drawn. Ported
// from the artifact's receipt()/barcode().
//
// `finding` is rich text (richText.ts: only <em> survives); every other field
// is escaped. Pass `editBase` (a dot path into avise.json) to emit the
// editor's data-edit hooks; the public site never does.

import { escapeHtml, richHtml } from './richText';

export { escapeHtml };

export type ReceiptLine = { l: string; v?: string; hl?: boolean; empty?: boolean };

export type ReceiptData = {
  title?: string;
  number?: string;
  lines: ReceiptLine[];
  finding?: string;
  source?: string;
  footer?: string;
};

const BARS = [3, 1, 2, 1, 4, 1, 1, 3, 2, 1, 1, 2, 4, 1, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 4, 1, 2, 1, 1, 3, 1, 2];

function barcode(): string {
  return (
    '<div class="receipt__barcode" aria-hidden="true">' +
    BARS.map(
      (w, i) => '<span style="width:' + w + 'px;background:' + (i % 2 ? 'transparent' : 'var(--ink)') + '"></span>'
    ).join('') +
    '</div>'
  );
}

/** Inner HTML of a `.receipt` element. */
export function receiptHTML(r: ReceiptData, editBase?: string): string {
  const ed = (key: string, kind: 'text' | 'rich' = 'text') =>
    editBase ? ' data-edit="' + escapeHtml(editBase + '.' + key) + '" data-edit-kind="' + kind + '"' : '';
  const title = r.title ? escapeHtml(r.title) : 'Avisé <span class="amp">&amp;</span> Co.';
  let html =
    '<div class="receipt__head"><span class="receipt__title"' +
    (r.title ? ed('title') : '') +
    '>' +
    title +
    '</span>' +
    (r.number ? '<span class="receipt__number"' + ed('number') + '>' + escapeHtml(r.number) + '</span>' : '') +
    '</div>' +
    '<div class="receipt__rule"></div><div class="receipt__lines"' +
    (editBase ? ' data-edit-list="' + escapeHtml(editBase + '.lines') + '"' : '') +
    '>' +
    r.lines
      .map((ln, i) => {
        const cls = 'receipt__line' + (ln.hl ? ' receipt__line--hl' : '') + (ln.empty ? ' receipt__line--empty' : '');
        return (
          '<div class="' + cls + '"' + (editBase ? ' data-edit-item="' + i + '"' : '') + '>' +
          '<span' + ed('lines.' + i + '.l') + '>' + escapeHtml(ln.l) + '</span>' +
          '<span' + ed('lines.' + i + '.v') + '>' + escapeHtml(ln.v || '') + '</span></div>'
        );
      })
      .join('') +
    '</div>';
  if (r.finding)
    html += '<div class="receipt__rule"></div><div class="receipt__finding"' + ed('finding', 'rich') + '>' + richHtml(r.finding) + '</div>';
  html += barcode();
  if (r.source) html += '<div class="receipt__source"' + ed('source') + '>' + escapeHtml(r.source) + '</div>';
  if (r.footer) html += '<div class="receipt__footer"' + ed('footer') + '>' + escapeHtml(r.footer) + '</div>';
  return html;
}
