// Till-receipt markup for the Avisé & Co. public site. One renderer shared by
// the server (set:html in Receipt.astro) and the browser (self-check, booking
// confirmation), so a receipt looks the same however it was drawn. Ported
// from the artifact's receipt()/barcode().
//
// `finding` is rich text (richText.ts: only <em> survives); every other field
// is escaped. Pass `edit` to emit the editor's data-edit hooks (the public site
// never does): a dot path into avise.json for a receipt stored as one object,
// or a ReceiptEditMap naming each field's path for one assembled from
// separate fields.

import { escapeHtml, richHtml, textHtml } from './richText';

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

export type ReceiptEditMap = {
  title?: string;
  number?: string;
  lines?: ({ l?: string; v?: string } | undefined)[];
  finding?: string;
  source?: string;
  footer?: string;
};

/** Inner HTML of a `.receipt` element. */
export function receiptHTML(r: ReceiptData, edit?: string | ReceiptEditMap): string {
  const editBase = typeof edit === 'string' ? edit : undefined;
  const map = typeof edit === 'object' ? edit : undefined;
  const pathFor = (key: string): string | undefined => {
    if (editBase) return editBase + '.' + key;
    if (!map) return undefined;
    const m = key.match(/^lines\.(\d+)\.([lv])$/);
    if (m) return map.lines?.[Number(m[1])]?.[m[2] as 'l' | 'v'];
    return map[key as 'title' | 'number' | 'finding' | 'source' | 'footer'];
  };
  const ed = (key: string, kind: 'text' | 'rich' = 'text') => {
    const path = pathFor(key);
    return path ? ' data-edit="' + escapeHtml(path) + '" data-edit-kind="' + kind + '"' : '';
  };
  const title = r.title ? textHtml(r.title) : 'Avisé <span class="amp">&amp;</span> Co.';
  let html =
    '<div class="receipt__head"><span class="receipt__title"' +
    (r.title ? ed('title') : '') +
    '>' +
    title +
    '</span>' +
    (r.number ? '<span class="receipt__number"' + ed('number') + '>' + textHtml(r.number) + '</span>' : '') +
    '</div>' +
    '<div class="receipt__rule"></div><div class="receipt__lines"' +
    (editBase ? ' data-edit-list="' + escapeHtml(editBase + '.lines') + '"' : '') +
    '>' +
    r.lines
      .map((ln, i) => {
        const cls = 'receipt__line' + (ln.hl ? ' receipt__line--hl' : '') + (ln.empty ? ' receipt__line--empty' : '');
        return (
          '<div class="' + cls + '"' + (editBase ? ' data-edit-item="' + i + '"' : '') + '>' +
          '<span' + ed('lines.' + i + '.l') + '>' + textHtml(ln.l) + '</span>' +
          '<span' + ed('lines.' + i + '.v') + '>' + textHtml(ln.v || '') + '</span></div>'
        );
      })
      .join('') +
    '</div>';
  if (r.finding)
    html += '<div class="receipt__rule"></div><div class="receipt__finding"' + ed('finding', 'rich') + '>' + richHtml(r.finding) + '</div>';
  html += barcode();
  if (r.source) html += '<div class="receipt__source"' + ed('source') + '>' + textHtml(r.source) + '</div>';
  if (r.footer) html += '<div class="receipt__footer"' + ed('footer') + '>' + textHtml(r.footer) + '</div>';
  return html;
}
