// The editing surface for the Avisé & Co. pages (browser-only). The /edit
// route renders the real page views with data-edit hooks (src/lib/editable.ts);
// this module turns them into an inline editor:
//
//   [data-edit="path"]        text whose value is avise.json at `path`
//     data-edit-kind="text"   plain text (contenteditable, plain-text only)
//     data-edit-kind="rich"   text with <em> emphasis (Ctrl/Cmd+I)
//     data-edit-kind="select" a <select> whose value is the field
//     data-edit-prefix="## "  stored before the visible text (subheadings)
//   [data-edit-list="path"]   container whose [data-edit-item] children are
//                             the items of the array at `path`
//
// Field edits save on blur through the shared autosaver (status, retries,
// beforeunload guard) and the shared undo/redo stack. Only the changed paths
// are sent; the server applies them to the latest draft. Adding, removing or
// moving list items saves the whole list, then reloads so the server renders
// the new structure.

import { getCsrfToken, getPath, makeAutosaver, saveArea, setPath } from './client';
import type { SaveResult } from './client';
import { commit, wireField } from './history';
import { richFromNode, richHtml } from '../richText';

type Seed = { content: Record<string, unknown>; page: string; readonly: boolean };

const seedEl = document.getElementById('editorSeed');
if (seedEl) start(JSON.parse(seedEl.textContent || '{}') as Seed);

function start(seed: Seed) {
  const working = structuredClone(seed.content);
  const dirty = new Set<string>();

  async function save(): Promise<SaveResult> {
    const paths = [...dirty];
    if (paths.length === 0) return { ok: true };
    dirty.clear();
    const result = await saveArea('avise', {
      page: seed.page,
      set: paths.map((path) => ({ path, value: getPath(working, path) })),
    });
    // A failed save keeps its fields pending for the retry / next save.
    if (!result.ok) paths.forEach((p) => dirty.add(p));
    return result;
  }

  const autosaver = makeAutosaver({ save, snapshot: () => JSON.stringify(working) });
  window.addEventListener('editor:save-all', () => void autosaver.flush());

  function setField(path: string, value: unknown) {
    setPath(working, path, value);
    dirty.add(path);
    autosaver.markDirty();
  }

  /** Save everything pending now; true once nothing is left unsaved. */
  async function saveNow(): Promise<boolean> {
    await autosaver.flush();
    return dirty.size === 0;
  }

  wireFields(working, setField, autosaver, seed.readonly);
  if (!seed.readonly) {
    wireLists(working, setField, saveNow);
    wireAboutPhoto(setField, saveNow);
  }
  guardClicks();
}

/* ---------- Fields ---------- */

function kindOf(el: HTMLElement): string {
  return el.dataset.editKind || 'text';
}

function readEl(el: HTMLElement): string {
  if (kindOf(el) === 'select') return (el as HTMLSelectElement).value;
  const value = kindOf(el) === 'rich' ? richFromNode(el) : el.textContent ?? '';
  return (el.dataset.editPrefix ?? '') + value;
}

function writeEl(el: HTMLElement, value: string) {
  if (kindOf(el) === 'select') {
    (el as HTMLSelectElement).value = value;
    return;
  }
  const prefix = el.dataset.editPrefix ?? '';
  const shown = prefix && value.startsWith(prefix) ? value.slice(prefix.length) : value;
  if (kindOf(el) === 'rich') el.innerHTML = richHtml(shown, { emClass: el.matches('h1, h2') });
  else el.textContent = shown;
}

function makeEditable(el: HTMLElement) {
  if (kindOf(el) === 'select') return;
  if (kindOf(el) === 'text') {
    // Plain-text editing where supported (no stray markup from typing/paste).
    el.contentEditable = 'plaintext-only';
    if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
  } else {
    el.contentEditable = 'true';
  }
  el.spellcheck = true;
  // Every field is one line or paragraph: Enter finishes the edit.
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      el.blur();
    }
  });
  // Paste as plain text (rich fields keep only typed emphasis).
  el.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = (event.clipboardData?.getData('text/plain') ?? '').replace(/\s*\n\s*/g, ' ');
    document.execCommand('insertText', false, text);
  });
}

function wireFields(
  working: Record<string, unknown>,
  setField: (path: string, value: unknown) => void,
  autosaver: ReturnType<typeof makeAutosaver>,
  readonly: boolean
) {
  // The same path can appear more than once on a page (e.g. a service name in
  // two places, a shared label): edits to one copy update the others.
  const groups = new Map<string, HTMLElement[]>();
  document.querySelectorAll<HTMLElement>('[data-edit]').forEach((el) => {
    const path = el.dataset.edit!;
    if (!groups.has(path)) groups.set(path, []);
    groups.get(path)!.push(el);
  });

  groups.forEach((els, path) => {
    const syncOthers = (from: HTMLElement | null, value: string) => {
      els.forEach((other) => {
        if (other !== from) writeEl(other, value);
      });
    };
    els.forEach((el, i) => {
      if (readonly) return;
      makeEditable(el);
      const onEdit = () => {
        const value = readEl(el);
        setField(path, value);
        syncOthers(el, value);
      };
      el.addEventListener(kindOf(el) === 'select' ? 'change' : 'input', onEdit);
      const historyId = `avise:${path}`;
      if (i === 0) {
        wireField({
          id: historyId,
          el,
          getValue: () => String(getPath(working, path) ?? ''),
          setValue: (value) => {
            els.forEach((target) => writeEl(target, value));
          },
          onApply: (value) => {
            setField(path, value);
            void autosaver.flush();
          },
          commitEvent: kindOf(el) === 'select' ? 'change' : 'blur',
        });
      } else {
        // Secondary copies share the first copy's undo history.
        el.addEventListener(kindOf(el) === 'select' ? 'change' : 'blur', () => commit(historyId));
      }
      el.addEventListener(kindOf(el) === 'select' ? 'change' : 'blur', () => {
        // Normalise what's shown (e.g. rich markup) to what will be saved.
        if (kindOf(el) === 'rich') writeEl(el, String(getPath(working, path) ?? ''));
        void autosaver.flushIfDirty();
      });
    });
  });
}

/* ---------- Clicks: edit text instead of following links/buttons ---------- */

function guardClicks() {
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target as Element | null;
      // Editing a link's or button's label must not navigate, submit or toggle.
      if (target?.closest('[data-edit]')) event.preventDefault();
    },
    true
  );
}

/* ---------- Lists: add, remove, move ---------- */

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

function wireLists(
  working: Record<string, unknown>,
  setField: (path: string, value: unknown) => void,
  saveNow: () => Promise<boolean>
) {
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
    setField(path, list);
    // Reload only once saved; a failed save leaves the page (and the pending
    // change) as is, with the toolbar showing the error.
    if (await saveNow()) {
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
        run: (l, i) => l.forEach((line, j) => {
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
    if (busy) return;
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
    const hit = itemOf(target);
    if (hit) {
      if (hit.itemEl !== current?.itemEl) showBar(hit.listEl, hit.itemEl);
    } else if (current && !current.listEl.contains(target)) {
      // Crossing the gap between an item and its bar stays inside the list.
      hideBar();
    }
  });
  document.addEventListener('focusin', (event) => {
    if (bar.contains(event.target as Node)) return;
    const hit = itemOf(event.target);
    if (hit) showBar(hit.listEl, hit.itemEl);
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

/* ---------- About photo ---------- */

function wireAboutPhoto(setField: (path: string, value: unknown) => void, saveNow: () => Promise<boolean>) {
  const upload = document.getElementById('aboutPhotoUpload');
  const remove = document.getElementById('aboutPhotoRemove');
  const input = document.getElementById('aboutPhotoInput') as HTMLInputElement | null;
  const status = document.getElementById('aboutPhotoStatus');
  if (!upload || !input) return;

  const say = (text: string) => {
    if (status) status.textContent = text;
  };

  async function setImage(path: string | null) {
    setField('aboutPage.image', path);
    if (await saveNow()) location.reload();
    else say('Uploaded, but saving failed. Use Save to draft to try again.');
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
