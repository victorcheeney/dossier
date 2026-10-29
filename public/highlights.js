// Highlights: select text in a highlightable pane to mark it, click a mark to note or delete it,
// Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z to undo and redo, outside text boxes.

// Text of a pane with whitespace collapsed, as the server compares quotes, and where each character sits.
function textMap(root) {
  let text = '';
  const points = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (let offset = 0; offset < node.data.length; offset++) {
      const char = node.data[offset];
      if (/\s/.test(char)) {
        if (text === '' || text.endsWith(' ')) continue;
        text += ' ';
      } else {
        text += char;
      }
      points.push({ node, offset });
    }
  }
  return { text, points };
}

function matchStarts(text, quote) {
  const starts = [];
  for (let i = text.indexOf(quote); i >= 0; i = text.indexOf(quote, i + 1)) starts.push(i);
  return starts;
}

// The selection as a quote, and which occurrence of that quote it is.
function quoteOf(pane, range) {
  const { text, points } = textMap(pane);
  const inside = points.map((p, i) => (range.comparePoint(p.node, p.offset) === 0 ? i : -1)).filter((i) => i >= 0);
  if (inside.length === 0) return null;
  let start = inside[0];
  let end = inside.at(-1) + 1;
  while (text[start] === ' ') start++;
  while (end > start && text[end - 1] === ' ') end--;
  const quote = text.slice(start, end);
  if (!quote) return null;
  return { quote, occurrence: matchStarts(text, quote).filter((i) => i < start).length };
}

function mark(pane, highlight) {
  const { text, points } = textMap(pane);
  const starts = matchStarts(text, highlight.quote);
  const start = starts[highlight.occurrence] ?? starts[0];
  if (start === undefined) return;
  const first = points[start];
  const last = points[start + highlight.quote.length - 1];

  const nodes = [];
  const walker = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT);
  walker.currentNode = first.node;
  for (let node = first.node; node; node = walker.nextNode()) {
    nodes.push(node);
    if (node === last.node) break;
  }
  let lastElement = null;
  for (const node of nodes) {
    const from = node === first.node ? first.offset : 0;
    const to = node === last.node ? last.offset + 1 : node.data.length;
    if (!node.data.slice(from, to).trim()) continue;
    if (to < node.data.length) node.splitText(to);
    const part = from > 0 ? node.splitText(from) : node;
    const element = document.createElement('mark');
    element.className = 'highlight';
    element.dataset.highlightId = highlight.id;
    element.title = highlight.note;
    part.replaceWith(element);
    element.append(part);
    lastElement = element;
  }
  lastElement?.classList.toggle('has-note', Boolean(highlight.note.trim()));
}

// The note icon sits after the last part of a Highlight that has a note.
function markNote(id, note) {
  const parts = document.querySelectorAll(`mark.highlight[data-highlight-id="${id}"]`);
  parts.forEach((part, index) => {
    part.title = note;
    part.classList.toggle('has-note', index === parts.length - 1 && Boolean(note.trim()));
  });
}

export function startHighlights({ post, refresh, showTab, onRegionChange, rendered }) {
  const dataElement = document.querySelector('[data-region="highlight-data"]');
  const button = document.querySelector('.highlight-button');
  const popover = document.querySelector('.popover');
  const noteBox = popover.querySelector('textarea');
  let highlights = [];

  function paint() {
    highlights = JSON.parse(dataElement.textContent);
    for (const pane of document.querySelectorAll('[data-highlightable]')) {
      pane.innerHTML = rendered.get(pane.dataset.region);
      for (const highlight of highlights) if (highlight.tab === pane.dataset.highlightable) mark(pane, highlight);
    }
  }
  for (const pane of document.querySelectorAll('[data-highlightable]')) onRegionChange(pane.dataset.region, paint);
  onRegionChange('highlight-data', paint);

  // Undo and redo

  const done = [];
  const undone = [];
  async function record(change) {
    await change.redo();
    done.push(change);
    undone.length = 0;
  }
  async function step(from, to, direction) {
    const change = from.pop();
    if (!change) return;
    await change[direction]();
    to.push(change);
    refresh();
  }
  const deleteChange = (id) => ({
    redo: () => post(`/highlights/${id}/delete`),
    undo: () => post(`/highlights/${id}/restore`),
  });

  document.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
    const target = event.target;
    if (target.closest('input, textarea, select, [contenteditable]')) return;
    event.preventDefault();
    if (event.shiftKey) step(undone, done, 'redo');
    else step(done, undone, 'undo');
  });

  // Creating

  let selected = null;
  function hideButton() {
    button.hidden = true;
    selected = null;
  }
  function offerHighlight() {
    const selection = getSelection();
    if (selection.isCollapsed || selection.rangeCount === 0) return hideButton();
    const range = selection.getRangeAt(0);
    const common = range.commonAncestorContainer;
    const pane = (common.nodeType === Node.ELEMENT_NODE ? common : common.parentElement).closest('[data-highlightable]');
    const quote = pane && !pane.querySelector('.empty-state') && quoteOf(pane, range);
    if (!quote) return hideButton();
    selected = { tab: pane.dataset.highlightable, ...quote };
    const box = range.getBoundingClientRect();
    button.style.left = `${box.left}px`;
    button.style.top = `${box.bottom + 6}px`;
    button.hidden = false;
  }
  document.addEventListener('mouseup', (event) => {
    if (event.target !== button) setTimeout(offerHighlight);
  });
  document.addEventListener('keyup', (event) => {
    if (event.shiftKey) offerHighlight();
  });
  document.addEventListener('selectionchange', () => {
    if (getSelection().isCollapsed) hideButton();
  });
  for (const pane of document.querySelectorAll('.pane')) pane.addEventListener('scroll', hideButton);
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', async () => {
    if (!selected) return;
    const input = { ...selected, note: '' };
    hideButton();
    getSelection().removeAllRanges();
    let id;
    await record({
      redo: async () => {
        if (id) return post(`/highlights/${id}/restore`);
        id = (await (await post('/highlights', input)).json()).id;
      },
      undo: () => post(`/highlights/${id}/delete`),
    });
    await refresh();
    // Open the note box on the new Highlight right away, once the refresh has painted it.
    for (let tries = 0; tries < 30; tries++) {
      const anchor = document.querySelector(`mark.highlight[data-highlight-id="${id}"]`);
      if (anchor && highlights.some((h) => h.id === id)) return openPopover(id, anchor);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });

  // The popover: note, delete, done

  let open = null; // { id, noteAtOpen, timer }
  function openPopover(id, anchor) {
    closePopover();
    const highlight = highlights.find((h) => h.id === id);
    if (!highlight) return;
    open = { id, noteAtOpen: highlight.note, timer: null };
    noteBox.value = highlight.note;
    const box = anchor.getBoundingClientRect();
    popover.style.left = `${Math.max(8, Math.min(box.left, innerWidth - 300))}px`;
    popover.style.top = `${Math.min(box.bottom + 6, innerHeight - 160)}px`;
    popover.hidden = false;
    noteBox.focus();
  }
  function saveNote() {
    clearTimeout(open.timer);
    return post(`/highlights/${open.id}/note`, { note: noteBox.value });
  }
  async function closePopover() {
    if (!open) return;
    const { id, noteAtOpen } = open;
    const note = noteBox.value;
    popover.hidden = true;
    if (note !== noteAtOpen) {
      await saveNote();
      done.push({
        redo: () => post(`/highlights/${id}/note`, { note }),
        undo: () => post(`/highlights/${id}/note`, { note: noteAtOpen }),
      });
      undone.length = 0;
    }
    open = null;
    refresh();
  }
  async function deleteHighlight(id) {
    if (open?.id === id) {
      popover.hidden = true;
      open = null;
    }
    await record(deleteChange(id));
    refresh();
  }

  noteBox.addEventListener('input', () => {
    if (open) markNote(open.id, noteBox.value);
    clearTimeout(open.timer);
    open.timer = setTimeout(saveNote, 600);
  });
  popover.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePopover();
  });

  // Notes edited in the Highlights tab: saved as the Candidate types, one undo step per edit.
  const listNotes = new Map(); // textarea → { id, before, timer }
  const growNote = (box) => { box.style.height = 'auto'; box.style.height = `${box.scrollHeight}px`; };
  document.querySelectorAll('[data-highlight-note]').forEach(growNote);
  onRegionChange('highlights', (region) => region.querySelectorAll('[data-highlight-note]').forEach(growNote));
  document.addEventListener('focusin', ({ target }) => {
    if (!target.matches?.('[data-highlight-note]')) return;
    const id = Number(target.closest('[data-highlight-id]').dataset.highlightId);
    listNotes.set(target, { id, before: target.value, saved: target.value, timer: null });
  });
  document.addEventListener('input', ({ target }) => {
    const entry = listNotes.get(target);
    if (!entry) return;
    growNote(target);
    markNote(entry.id, target.value);
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.saved = target.value;
      post(`/highlights/${entry.id}/note`, { note: entry.saved });
    }, 700);
  });
  document.addEventListener('focusout', async ({ target }) => {
    const entry = listNotes.get(target);
    if (!entry) return;
    listNotes.delete(target);
    clearTimeout(entry.timer);
    const { id, before, saved } = entry;
    const note = target.value;
    if (note === before) {
      if (saved !== note) await post(`/highlights/${id}/note`, { note });
      return;
    }
    await record({
      redo: () => post(`/highlights/${id}/note`, { note }),
      undo: () => post(`/highlights/${id}/note`, { note: before }),
    });
    refresh();
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    const markElement = target.closest('mark.highlight');
    const action = target.closest('[data-action]')?.dataset.action;
    const listed = Number(target.closest('[data-highlight-id]')?.dataset.highlightId);
    if (markElement) return openPopover(Number(markElement.dataset.highlightId), markElement);
    if (action === 'close-popover') return closePopover();
    if (action === 'delete-highlight') return deleteHighlight(open && popover.contains(target) ? open.id : listed);
    if (action === 'show-highlight') {
      const highlight = highlights.find((h) => h.id === listed);
      showTab(highlight.tab);
      const first = document.querySelector(`mark.highlight[data-highlight-id="${listed}"]`);
      first.scrollIntoView({ block: 'center' });
      return openPopover(listed, first);
    }
    if (open && !popover.contains(target)) closePopover();
  });

  paint();
}
