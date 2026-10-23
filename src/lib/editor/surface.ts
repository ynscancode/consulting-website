// The editing surface for the Avisé & Co. pages (browser-only). The /edit
// route renders the real page views with data-edit hooks (src/lib/editable.ts);
// this module turns them into an editor with three modes, kept on
// <html data-edit-mode> for the stylesheet:
//
//   viewing   (default) the page exactly as the live site shows it.
//   choosing  after the toolbar's ✎: editable text is outlined, the
//             editor-only panels and list controls appear, FAQs expand.
//             Clicking a field opens it instead of following its link.
//   editing   one field is open. Only the toolbar's Save and Cancel close
//             it (or Ctrl/Cmd+Enter and Esc); clicks elsewhere do nothing.
//
//   [data-edit="path"]        text whose value is avise.json at `path`
//     data-edit-kind="text"   plain text; Enter adds a line break
//     data-edit-kind="rich"   text with <em> emphasis (Ctrl/Cmd+I)
//     data-edit-kind="select" a <select> whose value is the field
//     data-edit-prefix="## "  stored before the visible text (subheadings)
//   [data-edit-list="path"]   container whose [data-edit-item] children are
//                             the items of the array at `path`
//
// Every Save writes that one field to the draft straight away. Undo and Redo
// step through saved edits and save too, so the page always shows the draft.
// Adding, removing or moving list items saves the whole list, then reloads so
// the server renders the new structure (list changes aren't undo steps).

import { getCsrfToken, getPath, saveArea, setPath, statusLabel, type SaveStatus } from './client';
import { richFromNode, richHtml, textFromNode, textHtml } from '../richText';

type Seed = { content: Record<string, unknown>; page: string; readonly: boolean };
type Mode = 'viewing' | 'choosing' | 'editing';
type Step = { path: string; from: string; to: string };
type Open = { el: HTMLElement; path: string; original: string };

function start(seed: Seed) {
  const working = structuredClone(seed.content);
  const root = document.documentElement;
  let mode: Mode = 'viewing';
  let open: Open | null = null;
  let saving = false;
  let expanded: HTMLDetailsElement[] = [];
  const history = loadHistory();

  /* ---------- State broadcast (the toolbar listens) ---------- */

  function broadcast() {
    if (mode === 'viewing') delete root.dataset.editMode;
    else root.dataset.editMode = mode;
    window.dispatchEvent(
      new CustomEvent('editor:state', {
        detail: { mode, saving, canUndo: history.undo.length > 0, canRedo: history.redo.length > 0 },
      })
    );
  }

  function setStatus(status: SaveStatus) {
    window.dispatchEvent(new CustomEvent('editor:area-status', { detail: { status, label: statusLabel(status) } }));
  }

  function say(text: string) {
    window.dispatchEvent(new CustomEvent('editor:message', { detail: { text } }));
  }

  /* ---------- Saving ---------- */

  let queue: Promise<unknown> = Promise.resolve();

  /** Saves edits to the draft, one request at a time. A transient GitHub
   * failure gets one automatic retry before it counts as failed. */
  function persist(set: { path: string; value: unknown }[]): Promise<boolean> {
    const run = async (): Promise<boolean> => {
      saving = true;
      broadcast();
      setStatus('saving');
      let result = await saveArea('avise', { page: seed.page, set }).catch(() => ({ ok: false, error: 'network_error' }));
      if (!result.ok && (result.error === 'github_unavailable' || result.error === 'network_error')) {
        setStatus('retrying');
        await new Promise((r) => setTimeout(r, 4000));
        result = await saveArea('avise', { page: seed.page, set }).catch(() => ({ ok: false, error: 'network_error' }));
      }
      saving = false;
      if (result.ok) setStatus('saved');
      else if (result.error !== 'csrf_invalid') setStatus('error'); // csrf: the toolbar shows "Session expired"
      broadcast();
      return result.ok;
    };
    const next = queue.then(run, run);
    queue = next;
    return next;
  }

  /* ---------- Fields ---------- */

  const kindOf = (el: HTMLElement) => el.dataset.editKind || 'text';

  function readEl(el: HTMLElement): string {
    if (kindOf(el) === 'select') return (el as HTMLSelectElement).value;
    const value = kindOf(el) === 'rich' ? richFromNode(el) : textFromNode(el);
    return (el.dataset.editPrefix ?? '') + value;
  }

  function writeEl(el: HTMLElement, value: string) {
    if (kindOf(el) === 'select') {
      (el as HTMLSelectElement).value = value;
      return;
    }
    const prefix = el.dataset.editPrefix ?? '';
    const shown = prefix && value.startsWith(prefix) ? value.slice(prefix.length) : value;
    el.innerHTML = kindOf(el) === 'rich' ? richHtml(shown, { emClass: el.matches('h1, h2') }) : textHtml(shown);
  }

  /** Every copy of a field on the page (e.g. a service name shown twice). */
  const copiesOf = (path: string) =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-edit]')).filter((el) => el.dataset.edit === path);

  function showValue(path: string, value: string) {
    copiesOf(path).forEach((el) => writeEl(el, value));
  }

  function setCaretFromPoint(x: number, y: number) {
    const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
    let range: Range | null = null;
    if (doc.caretPositionFromPoint) {
      const pos = doc.caretPositionFromPoint(x, y);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
      }
    } else if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
    }
    if (!range || !open?.el.contains(range.startContainer)) return;
    range.collapse(true);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  function openField(el: HTMLElement, x?: number, y?: number) {
    const path = el.dataset.edit!;
    open = { el, path, original: String(getPath(working, path) ?? '') };
    mode = 'editing';
    el.classList.add('is-editing');
    if (kindOf(el) !== 'select') {
      if (kindOf(el) === 'text') {
        el.contentEditable = 'plaintext-only';
        if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
      } else {
        el.contentEditable = 'true';
      }
      el.spellcheck = true;
      el.focus();
      if (x !== undefined && y !== undefined) setCaretFromPoint(x, y);
    } else {
      el.focus();
    }
    setStatus('dirty');
    say('Editing. Save or Cancel in the toolbar when you’re done.');
    broadcast();
  }

  function closeField() {
    if (!open) return;
    const { el } = open;
    el.classList.remove('is-editing');
    el.removeAttribute('contenteditable');
    el.blur();
    open = null;
    stopChoosing();
  }

  async function saveField() {
    if (!open || saving) return;
    const { el, path, original } = open;
    const value = readEl(el);
    if (value === original) {
      showValue(path, original);
      closeField();
      setStatus('idle');
      say('');
      return;
    }
    setPath(working, path, value);
    if (await persist([{ path, value }])) {
      showValue(path, value); // normalised to what was saved, on every copy
      pushStep({ path, from: original, to: value });
      closeField();
      say('');
    } else {
      // Keep the field open with its text, so Save can be tried again.
      setPath(working, path, original);
      say('That didn’t save. Try Save again, or Cancel.');
    }
  }

  function cancelField() {
    if (!open || saving) return;
    showValue(open.path, open.original);
    closeField();
    setStatus('idle');
    say('');
  }

  /* ---------- Choosing ---------- */

  function startChoosing() {
    if (seed.readonly || mode !== 'viewing') return;
    mode = 'choosing';
    // Expand every FAQ so its answer can be picked too; closed again after.
    expanded = Array.from(document.querySelectorAll<HTMLDetailsElement>('main details:not([open])'));
    expanded.forEach((d) => (d.open = true));
    say('Click any outlined text to edit it. Press ✎ again or Esc to stop.');
    broadcast();
  }

  function stopChoosing() {
    expanded.forEach((d) => (d.open = false));
    expanded = [];
    mode = 'viewing';
    if (!open) say('');
    broadcast();
  }

  /* ---------- Undo / redo (saved edits, saved again) ---------- */

  function pushStep(step: Step) {
    history.undo.push(step);
    if (history.undo.length > 100) history.undo.shift();
    history.redo = [];
    saveHistory(history);
    broadcast();
  }

  async function step(direction: 'undo' | 'redo') {
    if (mode === 'editing' || saving) return;
    const from = direction === 'undo' ? history.undo : history.redo;
    const to = direction === 'undo' ? history.redo : history.undo;
    const s = from.pop();
    if (!s) return;
    const value = direction === 'undo' ? s.from : s.to;
    const previous = direction === 'undo' ? s.to : s.from;
    setPath(working, s.path, value);
    showValue(s.path, value);
    saveHistory(history);
    if (await persist([{ path: s.path, value }])) {
      to.push(s);
      saveHistory(history);
      say(direction === 'undo' ? 'Undone and saved.' : 'Redone and saved.');
    } else {
      // Put everything back as it was before the attempt.
      setPath(working, s.path, previous);
      showValue(s.path, previous);
      from.push(s);
      saveHistory(history);
      say(direction === 'undo' ? 'Couldn’t undo: the change didn’t save.' : 'Couldn’t redo: the change didn’t save.');
    }
    broadcast();
  }

  /* ---------- Toolbar requests ---------- */

  window.addEventListener('editor:toggle-choose', () => (mode === 'choosing' ? stopChoosing() : startChoosing()));
  window.addEventListener('editor:save-field', () => void saveField());
  window.addEventListener('editor:cancel-field', () => cancelField());
  window.addEventListener('editor:undo', () => void step('undo'));
  window.addEventListener('editor:redo', () => void step('redo'));
  // The toolbar may start listening after the first broadcast: it asks.
  window.addEventListener('editor:state-request', broadcast);

  /* ---------- Keyboard ---------- */

  document.addEventListener(
    'keydown',
    (event) => {
      if (mode === 'choosing' && event.key === 'Escape') {
        event.preventDefault();
        stopChoosing();
        return;
      }
      if (mode !== 'editing' || !open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelField();
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void saveField();
      } else if (open.el.contains(event.target as Node) && kindOf(open.el) !== 'select') {
        if (event.key === 'Enter') {
          // A line break, never a new block (and never a button press).
          event.preventDefault();
          document.execCommand('insertLineBreak');
        } else if (event.key === ' ' && open.el.matches('button, summary, a')) {
          // A space, not a press of the button/summary being edited.
          event.preventDefault();
          document.execCommand('insertText', false, ' ');
        }
      }
    },
    true
  );

  // Paste as plain text (rich fields keep only typed emphasis); line breaks stay.
  document.addEventListener('paste', (event) => {
    if (!open || !open.el.contains(event.target as Node) || kindOf(open.el) === 'select') return;
    event.preventDefault();
    document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') ?? '');
  });

  /* ---------- Clicks ---------- */

  const inToolbar = (t: Element | null) => !!t?.closest('#editor-toolbar');

  function guard(event: MouseEvent) {
    const target = event.target as Element | null;
    if (mode === 'viewing' || inToolbar(target) || target?.closest('.edit-listbar')) return;

    if (mode === 'editing' && open) {
      if (open.el.contains(target)) {
        // Place the caret, but don't follow a link or press a button being edited.
        if (event.type === 'click') event.preventDefault();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.type === 'click') say('Save or Cancel this field first.');
      return;
    }

    // Choosing: a click on outlined text opens it.
    const field = target?.closest<HTMLElement>('[data-edit]');
    if (field) {
      event.preventDefault();
      event.stopPropagation();
      // A <select> opens on mousedown; everything else on click.
      const isSelect = kindOf(field) === 'select';
      if ((isSelect && event.type === 'mousedown') || (!isSelect && event.type === 'click')) {
        openField(field, event.clientX, event.clientY);
      }
    }
  }
  document.addEventListener('mousedown', guard, true);
  document.addEventListener('click', guard, true);
  document.addEventListener('submit', (event) => event.preventDefault(), true);

  window.addEventListener('beforeunload', (event) => {
    const unsaved = (open && readEl(open.el) !== open.original) || saving;
    if (!unsaved) return;
    event.preventDefault();
    event.returnValue = '';
  });

  if (!seed.readonly) {
    wireLists(working, persist, () => mode === 'choosing');
    wireAboutPhoto(persist);
  }
  broadcast();
}

/* ---------- Undo history (kept for the tab, across page changes) ---------- */

const HISTORY_KEY = 'avise:edit-history';

function loadHistory(): { undo: Step[]; redo: Step[] } {
  try {
    const raw = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || 'null');
    if (raw && Array.isArray(raw.undo) && Array.isArray(raw.redo)) return raw;
  } catch {
    // Storage unavailable or corrupt: start empty.
  }
  return { undo: [], redo: [] };
}

function saveHistory(history: { undo: Step[]; redo: Step[] }) {
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Storage unavailable: history lasts for this page only.
  }
}

/* ---------- Lists: add, remove, move (while choosing) ---------- */

type Persist = (set: { path: string; value: unknown }[]) => Promise<boolean>;
type ListOp = { label: string; title: string; run: (list: unknown[], index: number) => void; danger?: boolean };

function newItemFor(listPath: string, list: unknown[], variant?: 'subheading'): unknown {
  const key = listPath.split('.').pop()!;
  const n = list.length + 1;
  const pad = (x: number) => String(x).padStart(2, '0');
  switch (key) {
    case 'steps':
      return { t: 'New step', b: 'What happens in this step.' };
    case 'principles':
      return { t: 'A new <em>principle.</em>', b: 'One line on what it means for the owner.' };
    case 'faqServices':
    case 'faqContact':
      return { q: 'A new question?', a: 'The answer.' };
    case 'symptoms':
      return { id: `symptom-${Date.now().toString(36)}`, label: 'A new symptom', fix: 'What we would look at', area: 'profit' };
    case 'lines':
      return { l: 'New line', v: '[x]' };
    case 'body':
      return variant === 'subheading' ? '## New subheading' : 'New paragraph.';
    case 'insights': {
      const ids = new Set(list.map((item) => (item as { id: string }).id));
      let i = n;
      while (ids.has(`insight-${pad(i)}`)) i++;
      return {
        id: `insight-${pad(i)}`,
        sector: 'Retail',
        meta: `Insight ${pad(i)}, retail`,
        tone: 'card',
        headline: 'A new insight, stated as the finding.',
        lede: 'One or two lines on what we saw.',
        body: ['The first paragraph.', 'The second paragraph.', '## What we looked at', 'How we got the numbers.'],
        receipt: {
          title: 'Receipt',
          number: `No. ${pad(i)}`,
          lines: [
            { l: 'First figure', v: '[x]' },
            { l: 'The figure that matters', v: '[x]%', hl: true },
          ],
          finding: 'The finding, with the key word in <em>italics.</em>',
          source: 'Source: [publisher], [year]',
        },
      };
    }
    default:
      return 'New item';
  }
}

function wireLists(working: Record<string, unknown>, persist: Persist, active: () => boolean) {
  const bar = document.createElement('div');
  bar.className = 'edit-listbar';
  bar.setAttribute('role', 'toolbar');
  bar.hidden = true;
  document.body.appendChild(bar);

  let current: { listEl: HTMLElement; itemEl: HTMLElement } | null = null;
  let busy = false;

  async function applyListChange(path: string, list: unknown[]) {
    busy = true;
    document.documentElement.classList.add('edit-busy');
    setPath(working, path, list);
    // Reload only once saved; a failed save leaves the page as it was, with
    // the toolbar showing the error.
    if (await persist([{ path, value: list }])) {
      location.reload();
    } else {
      busy = false;
      document.documentElement.classList.remove('edit-busy');
    }
  }

  function opsFor(listPath: string, list: unknown[], index: number): ListOp[] {
    const key = listPath.split('.').pop()!;
    const noun = key === 'insights' ? 'insight' : key === 'body' ? 'paragraph' : 'item';
    const ops: ListOp[] = [
      { label: '↑', title: 'Move up', run: (l, i) => i > 0 && l.splice(i - 1, 0, l.splice(i, 1)[0]) },
      { label: '↓', title: 'Move down', run: (l, i) => i < l.length - 1 && l.splice(i + 1, 0, l.splice(i, 1)[0]) },
      { label: '+', title: `Add ${noun} after this`, run: (l, i) => l.splice(i + 1, 0, newItemFor(listPath, l)) },
    ];
    if (key === 'body') {
      ops.push({ label: '+ H', title: 'Add subheading after this', run: (l, i) => l.splice(i + 1, 0, newItemFor(listPath, l, 'subheading')) });
    }
    if (key === 'lines') {
      ops.push({
        label: '★',
        title: 'Make this the highlighted line',
        run: (l, i) =>
          l.forEach((line, j) => {
            const ln = line as { hl?: boolean };
            if (j === i) ln.hl = true;
            else delete ln.hl;
          }),
      });
    }
    ops.push({ label: '✕', title: `Remove this ${noun}`, danger: true, run: (l, i) => l.splice(i, 1) });
    return ops.filter((op) => !(op.title === 'Move up' && index === 0) && !(op.title === 'Move down' && index === list.length - 1));
  }

  function showBar(listEl: HTMLElement, itemEl: HTMLElement) {
    if (busy || !active()) return;
    current = { listEl, itemEl };
    const path = listEl.dataset.editList!;
    const list = getPath(working, path) as unknown[];
    const index = Number(itemEl.dataset.editItem);
    bar.replaceChildren(
      ...opsFor(path, list, index).map((op) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'edit-listbar__btn' + (op.danger ? ' edit-listbar__btn--danger' : '');
        button.textContent = op.label;
        button.title = op.title;
        button.setAttribute('aria-label', op.title);
        button.addEventListener('mousedown', (event) => event.preventDefault());
        button.addEventListener('click', () => {
          if (op.danger && path.endsWith('insights') && !window.confirm('Remove this insight and its page?')) return;
          const next = structuredClone(getPath(working, path) as unknown[]);
          op.run(next, index);
          void applyListChange(path, next);
        });
        return button;
      })
    );
    const rect = itemEl.getBoundingClientRect();
    bar.hidden = false;
    const width = bar.offsetWidth;
    bar.style.top = `${window.scrollY + rect.top - bar.offsetHeight - 4}px`;
    bar.style.left = `${window.scrollX + Math.max(8, Math.min(rect.right - width, document.documentElement.clientWidth - width - 8))}px`;
  }

  function hideBar() {
    current = null;
    bar.hidden = true;
  }

  const itemOf = (target: EventTarget | null) => {
    const itemEl = (target as Element | null)?.closest?.<HTMLElement>('[data-edit-item]');
    const listEl = itemEl?.parentElement?.closest<HTMLElement>('[data-edit-list]');
    return itemEl && listEl ? { itemEl, listEl } : null;
  };

  document.addEventListener('mouseover', (event) => {
    const target = event.target as Node;
    if (bar.contains(target)) return;
    if (!active()) return hideBar();
    const hit = itemOf(target);
    if (hit) {
      if (hit.itemEl !== current?.itemEl) showBar(hit.listEl, hit.itemEl);
    } else if (current && !current.listEl.contains(target)) {
      // Crossing the gap between an item and its bar stays inside the list.
      hideBar();
    }
  });
  // Touch screens have no hover: a tap on a list item (outside its text) shows its bar.
  document.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' || bar.contains(event.target as Node)) return;
    const hit = itemOf(event.target);
    if (hit && active()) showBar(hit.listEl, hit.itemEl);
  });
  window.addEventListener('editor:state', () => {
    if (!active()) hideBar();
  });
  document.addEventListener('mouseleave', hideBar);
  window.addEventListener('resize', () => current && showBar(current.listEl, current.itemEl));

  // An empty list has no item to hang the bar on: give it an add button.
  document.querySelectorAll<HTMLElement>('[data-edit-list]').forEach((listEl) => {
    if (listEl.querySelector(':scope > [data-edit-item]')) return;
    const path = listEl.dataset.editList!;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'edit-btn edit-add-first';
    button.textContent = '+ Add';
    button.addEventListener('click', () => {
      const next = structuredClone((getPath(working, path) as unknown[]) ?? []);
      next.push(newItemFor(path, next));
      void applyListChange(path, next);
    });
    listEl.appendChild(button);
  });
}

/* ---------- About photo (while choosing) ---------- */

function wireAboutPhoto(persist: Persist) {
  const upload = document.getElementById('aboutPhotoUpload');
  const remove = document.getElementById('aboutPhotoRemove');
  const input = document.getElementById('aboutPhotoInput') as HTMLInputElement | null;
  const status = document.getElementById('aboutPhotoStatus');
  if (!upload || !input) return;

  const say = (text: string) => {
    if (status) status.textContent = text;
  };

  async function setImage(path: string | null) {
    if (await persist([{ path: 'aboutPage.image', value: path }])) location.reload();
    else say('Uploaded, but saving failed. Try again.');
  }

  upload.addEventListener('click', () => input.click());
  remove?.addEventListener('click', () => void setImage(null));
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      say('Please choose a JPEG, PNG or WebP image under 2 MB.');
      return;
    }
    say('Uploading…');
    const reader = new FileReader();
    reader.onload = async () => {
      const result = String(reader.result);
      const contentBase64 = result.slice(result.indexOf(',') + 1);
      try {
        const res = await fetch('/api/upload/about-image', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
          body: JSON.stringify({ contentBase64 }),
        });
        const data = (await res.json().catch(() => null)) as { path?: string; error?: string } | null;
        if (res.status === 403 && data?.error === 'csrf_invalid') {
          window.dispatchEvent(new CustomEvent('editor:reauth-needed'));
          return;
        }
        if (!res.ok || !data?.path) {
          say('Upload failed. Please choose a JPEG, PNG or WebP image under 2 MB.');
          return;
        }
        say('Uploaded. Saving…');
        await setImage(data.path);
      } catch {
        say('Upload failed. Try again.');
      }
    };
    reader.readAsDataURL(file);
  });
}

// Start last, once every module-level constant above is initialised.
const seedEl = document.getElementById('editorSeed');
if (seedEl) start(JSON.parse(seedEl.textContent || '{}') as Seed);
