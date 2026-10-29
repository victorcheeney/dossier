import { startHighlights } from './highlights.js';
import { startNotes } from './notes.js';
import { startResume } from './resume.js';

// The Application page: tabs, Answers that save as the Candidate types, and live updates from the server.
// Rule: a refresh never touches the element the Candidate is typing in; it catches up when they leave it.

const workspace = document.querySelector('[data-application]');
const base = `/applications/${workspace.dataset.application}`;

async function post(path, data = {}) {
  const response = await fetch(base + path, { method: 'POST', body: new URLSearchParams(data) });
  if (!response.ok) throw new Error(await response.text());
  return response;
}

// Tabs

const tabs = [...document.querySelectorAll('[data-tab]')];
function showTab(name) {
  for (const tab of tabs) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
  for (const pane of document.querySelectorAll('[data-pane]')) pane.hidden = pane.dataset.pane !== name;
}
for (const tab of tabs) tab.addEventListener('click', () => showTab(tab.dataset.tab));

// Answers

const saveDelay = 1000;
const answers = new WeakMap(); // control → { saved, timer, savedAt }

function trackAnswers(root) {
  for (const control of root.querySelectorAll('.answer')) {
    if (!answers.has(control)) answers.set(control, { saved: control.value, timer: null, savedAt: 0 });
    grow(control);
  }
}

function grow(control) {
  if (control.tagName !== 'TEXTAREA') return;
  control.style.height = 'auto';
  control.style.height = `${control.scrollHeight + 2}px`;
}

function note(control, text) {
  control.closest('.field').querySelector('.saved').textContent = text;
}

async function saveAnswer(control) {
  const state = answers.get(control);
  clearTimeout(state.timer);
  state.timer = null;
  const text = control.value;
  if (text === state.saved) return;
  const fieldId = control.closest('[data-field-id]').dataset.fieldId;
  try {
    await post(`/answers/${fieldId}`, { text });
    state.saved = text;
    state.savedAt = performance.now();
    if (control.value === text) note(control, 'Saved');
  } catch {
    note(control, 'Not saved');
  }
}

const isUnsaved = (control) => control.value !== answers.get(control).saved;

document.addEventListener('input', ({ target }) => {
  if (!answers.has(target)) return;
  grow(target);
  note(target, '');
  const state = answers.get(target);
  clearTimeout(state.timer);
  state.timer = setTimeout(() => saveAnswer(target), target.tagName === 'SELECT' ? 0 : saveDelay);
});

document.addEventListener('focusout', ({ target }) => {
  if (answers.has(target)) saveAnswer(target);
  // Let focus land first, then catch up on what was held back while the Candidate was typing.
  setTimeout(() => {
    if (heldBack) refresh();
  });
});

addEventListener('resize', () => trackAnswers(document));

// Live updates

let heldBack = false;
const rendered = new Map(); // region name → the server's HTML for it, before any client changes such as Highlight marks
const regionHooks = new Map(); // region name → function called after it changes
function onRegionChange(name, hook) {
  regionHooks.set(name, hook);
}

let refreshing = false;
let refreshAgain = false;
async function refresh() {
  if (refreshing) {
    refreshAgain = true;
    return;
  }
  refreshing = true;
  heldBack = false;
  const startedAt = performance.now();
  try {
    const response = await fetch(base);
    if (response.status === 404) return location.assign('/');
    if (!response.ok) return;
    apply(new DOMParser().parseFromString(await response.text(), 'text/html'), startedAt);
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

function apply(fresh, startedAt) {
  for (const next of fresh.querySelectorAll('[data-region]')) {
    const name = next.dataset.region;
    const current = document.querySelector(`[data-region="${name}"]`);
    if (!current) continue;
    if (name === 'fields') updateFields(current, next, startedAt);
    else if (isTypingIn(current) || current.querySelector('.editing')) heldBack = true;
    else if (rendered.get(name) !== next.innerHTML) {
      current.innerHTML = next.innerHTML;
      rendered.set(name, next.innerHTML);
      regionHooks.get(name)?.(current);
    }
  }
}

function isTypingIn(region) {
  return region.contains(document.activeElement) && document.activeElement.matches('input, textarea, select');
}

// Keeps a box the Candidate is in, or has edits not yet saved, as it is.
function isBusy(control, startedAt) {
  const busy = control === document.activeElement || isUnsaved(control) || answers.get(control).savedAt > startedAt;
  if (busy) heldBack = true;
  return busy;
}

function updateFields(form, next, startedAt) {
  const boxes = (root) => [...root.querySelectorAll('[data-field-id]')];
  const shape = (root) => boxes(root).map((box) => box.dataset.fieldId + box.dataset.shape).join('\n');

  if (shape(form) !== shape(next)) {
    // The Field list changed: take the new one, but move over any box the Candidate is busy in.
    for (const box of boxes(form)) {
      const control = box.querySelector('.answer');
      const replacement = next.querySelector(`[data-field-id="${box.dataset.fieldId}"] .answer`);
      if (control && replacement && replacement.tagName === control.tagName && isBusy(control, startedAt)) {
        replacement.replaceWith(control);
      }
    }
    form.replaceChildren(...next.childNodes);
    trackAnswers(form);
    return;
  }

  for (const control of form.querySelectorAll('.answer')) {
    const value = next.querySelector(`#${control.id}`).value;
    if (control.value === value || isBusy(control, startedAt)) continue;
    control.value = value;
    answers.get(control).saved = value;
    grow(control);
    note(control, 'Updated');
  }
}

for (const region of document.querySelectorAll('[data-region]')) rendered.set(region.dataset.region, region.innerHTML);
trackAnswers(document);
startHighlights({ post, refresh, showTab, onRegionChange, rendered });
startNotes({ post, refresh, rendered });
startResume({ onRegionChange });

const events = new EventSource(`${base}/events`);
let missed = false;
events.addEventListener('error', () => {
  missed = true;
});
events.addEventListener('open', () => {
  if (missed) refresh();
  missed = false;
});
events.addEventListener('message', (event) => {
  if (JSON.parse(event.data).what === 'deleted') location.assign('/');
  else refresh();
});
