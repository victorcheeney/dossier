import './copy.js';

// The Profile page: the selected document's name and text save as the Candidate types, and the page
// follows the Agent's changes live. A refresh never touches the box the Candidate is in or has unsaved edits in.

const saveDelay = 800;
const root = document.querySelector('[data-document]');
const id = () => root.dataset.document;
const boxes = {
  name: (doc = document) => doc.querySelector('.doc-title'),
  text: (doc = document) => doc.querySelector('.doc-body'),
};
const saved = new Map(); // 'name' | 'text' → the value the server has
const timers = new Map();

function status(text) {
  const element = document.querySelector('.status');
  if (element) element.textContent = text;
}

function remember() {
  saved.clear();
  for (const [key, box] of Object.entries(boxes)) if (box()) saved.set(key, box().value);
  grow();
}

function grow() {
  const body = boxes.text();
  if (!body) return;
  body.style.height = 'auto';
  body.style.height = `${body.scrollHeight + 2}px`;
}

const isUnsaved = (key) => boxes[key]() && boxes[key]().value !== saved.get(key);

async function save(key, { keepalive = false } = {}) {
  clearTimeout(timers.get(key));
  timers.delete(key);
  const box = boxes[key]();
  if (!box || !isUnsaved(key)) return;
  const value = box.value;
  if (key === 'name' && value.trim() === '') return status('A document needs a name');
  try {
    const response = await fetch(`/profile/${id()}`, { method: 'POST', body: new URLSearchParams({ [key]: value }), keepalive });
    if (!response.ok) return status(response.status === 409 ? 'That name is taken' : 'Not saved');
    saved.set(key, value);
    if (key === 'name') document.title = `${value.trim()} · Profile · Dossier`;
    if (!isUnsaved('name') && !isUnsaved('text')) status('Saved');
  } catch {
    status('Not saved');
  }
}

const saveAll = (options) => Promise.all(['name', 'text'].map((key) => save(key, options)));

document.addEventListener('input', ({ target }) => {
  const key = target === boxes.name() ? 'name' : target === boxes.text() ? 'text' : null;
  if (!key) return;
  if (key === 'text') grow();
  status('Saving…');
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => save(key), saveDelay));
});

document.addEventListener('focusout', ({ target }) => {
  if (target === boxes.name()) save('name');
  if (target === boxes.text()) save('text');
  setTimeout(() => {
    if (heldBack) refresh();
  });
});

// Save before leaving for another document, and as the tab closes.
document.addEventListener('click', async (event) => {
  const link = event.target.closest('a[href]');
  if (!link || (!isUnsaved('name') && !isUnsaved('text'))) return;
  event.preventDefault();
  await saveAll();
  location.assign(link.href);
});
addEventListener('pagehide', () => saveAll({ keepalive: true }));

// Live updates

let heldBack = false;
let refreshing = false;
let refreshAgain = false;

async function refresh() {
  if (refreshing) {
    refreshAgain = true;
    return;
  }
  refreshing = true;
  heldBack = false;
  try {
    const response = await fetch(location.pathname);
    if (response.status === 404) return location.assign('/profile');
    if (response.ok) apply(new DOMParser().parseFromString(await response.text(), 'text/html'));
  } catch {
    heldBack = true;
  } finally {
    refreshing = false;
    if (refreshAgain) {
      refreshAgain = false;
      refresh();
    }
  }
}

function isBusy(key) {
  const busy = boxes[key]() === document.activeElement || isUnsaved(key);
  if (busy) heldBack = true;
  return busy;
}

function apply(fresh) {
  const region = (doc, name) => doc.querySelector(`[data-region="${name}"]`);
  region(document, 'documents').innerHTML = region(fresh, 'documents').innerHTML;

  const freshId = fresh.querySelector('[data-document]').dataset.document;
  if (freshId !== id()) {
    // Another document is now the one shown, such as the first one the Agent created.
    if (isBusy('name') || isBusy('text')) return;
    root.dataset.document = freshId;
    region(document, 'editor').innerHTML = region(fresh, 'editor').innerHTML;
    document.title = fresh.title;
    remember();
    return;
  }
  for (const [key, box] of Object.entries(boxes)) {
    const next = box(fresh);
    if (!box() || !next || box().value === next.value || isBusy(key)) continue;
    box().value = next.value;
    saved.set(key, next.value);
    if (key === 'name') document.title = fresh.title;
    status('Updated');
  }
  grow();
}

remember();
addEventListener('resize', grow);
// A new, empty document: start typing its name, or its text for a suggested one.
if (boxes.text()?.value === '') {
  const name = boxes.name();
  if (/^Untitled( \d+)?$/.test(name.value)) name.select();
  else boxes.text().focus();
}

const events = new EventSource('/profile/events');
let missed = false;
events.addEventListener('error', () => {
  missed = true;
});
events.addEventListener('open', () => {
  if (missed) refresh();
  missed = false;
});
events.addEventListener('message', refresh);
