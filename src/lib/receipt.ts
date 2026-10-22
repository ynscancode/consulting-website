// Till-receipt markup for the Avisé & Co. public site. One renderer shared by
// the server (set:html in Receipt.astro) and the browser (self-check, booking
// confirmation), so a receipt looks the same however it was drawn. Ported
// from the artifact's receipt()/barcode().
//
// `finding` is trusted HTML (it carries the <em> emphasis); every other
// field is escaped.

export type ReceiptLine = { l: string; v?: string; hl?: boolean; empty?: boolean };

export type ReceiptData = {
  title?: string;
  number?: string;
  lines: ReceiptLine[];
  finding?: string;
  source?: string;
  footer?: string;
};

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

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
export function receiptHTML(r: ReceiptData): string {
  const title = r.title ? escapeHtml(r.title) : 'Avisé <span class="amp">&amp;</span> Co.';
  let html =
    '<div class="receipt__head"><span class="receipt__title">' +
    title +
    '</span>' +
    (r.number ? '<span class="receipt__number">' + escapeHtml(r.number) + '</span>' : '') +
    '</div>' +
    '<div class="receipt__rule"></div><div class="receipt__lines">' +
    r.lines
      .map((ln) => {
        const cls = 'receipt__line' + (ln.hl ? ' receipt__line--hl' : '') + (ln.empty ? ' receipt__line--empty' : '');
        return '<div class="' + cls + '"><span>' + escapeHtml(ln.l) + '</span><span>' + escapeHtml(ln.v || '') + '</span></div>';
      })
      .join('') +
    '</div>';
  if (r.finding) html += '<div class="receipt__rule"></div><div class="receipt__finding">' + r.finding + '</div>';
  html += barcode();
  if (r.source) html += '<div class="receipt__source">' + escapeHtml(r.source) + '</div>';
  if (r.footer) html += '<div class="receipt__footer">' + escapeHtml(r.footer) + '</div>';
  return html;
}
