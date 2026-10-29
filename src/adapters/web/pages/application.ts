import type { Application, Field, HighlightTab } from '../../../core/domain.ts';
import { renderMarkdown } from '../markdown.ts';
import { html, page, shortDate } from './html.ts';
import { stageChoices, stageLabel } from './stage.ts';

// The three-column page. Every element marked data-region is refreshed in place when the Application changes;
// public/application.js relies on these names and on data-field-id.
export function applicationPage(application: Application): string {
  const title = `${application.company} · ${application.role}`;
  return page(
    title,
    'applications',
    html`<div class="workspace" data-application="${application.id}">
  <section class="column left">
    <header class="glance" data-region="glance">${glance(application)}</header>
    <nav class="tabs" role="tablist">
      <button type="button" role="tab" data-tab="posting" aria-selected="true">Posting</button>
      <button type="button" role="tab" data-tab="summary" aria-selected="false">Summary</button>
      <button type="button" role="tab" data-tab="research" aria-selected="false">Research</button>
      <button type="button" role="tab" data-tab="highlights" aria-selected="false">Highlights<span class="count" data-region="highlight-count">${count(application.highlights)}</span></button>
      <button type="button" role="tab" data-tab="notes" aria-selected="false">Notes<span class="count" data-region="note-count">${count(application.notes)}</span></button>
    </nav>
    <div class="pane" data-pane="posting" data-region="posting" data-highlightable="posting">${posting(application)}</div>
    <div class="pane" data-pane="summary" data-region="summary" hidden>${markdownOr(
      application.summary,
      'Your Agent will put its Summary of the Posting here: the job, what they want, how they work, the process, and what to watch out for.',
    )}</div>
    <div class="pane" data-pane="research" data-region="research" data-highlightable="research" hidden>${markdownOr(
      application.research,
      `Your Agent will put what it finds about ${application.company} here: the product and who uses it, reviews, and questions to ask in interviews.`,
    )}</div>
    <div class="pane" data-pane="highlights" data-region="highlights" hidden>${highlightList(application)}</div>
    <div class="pane" data-pane="notes" hidden>
      <form class="note-add">
        <label class="visually-hidden" for="new-note">New note</label>
        <textarea id="new-note" name="text" rows="2" placeholder="Add a note, such as what a recruiter told you"></textarea>
        <button class="button">Add note</button>
      </form>
      <div data-region="notes">${noteList(application)}</div>
    </div>
  </section>
  <main class="column form" data-region="fields">
    <h2 class="label">Application form</h2>
    ${application.fields.length === 0
      ? html`<p class="muted">Your Agent will add the form's Fields here.</p>`
      : application.fields.map(fieldBox)}
    <form method="post" action="/applications/${application.id}/delete" class="danger"
      onsubmit="return confirm('Delete this Application? Its Answers go with it.')">
      <button class="button secondary">Delete Application</button>
    </form>
  </main>
  <aside class="column resume" id="resume" data-region="resume">${resumeColumn(application)}</aside>
</div>
<script type="application/json" data-region="highlight-data">${jsonForScript(
      application.highlights.filter((h) => h.found).map(({ id, tab, quote, occurrence, note }) => ({ id, tab, quote, occurrence, note })),
    )}</script>
<button type="button" class="highlight-button" hidden>Highlight</button>
<div class="popover" role="dialog" aria-label="Highlight" hidden>
  <label class="visually-hidden" for="highlight-note">Note</label>
  <textarea id="highlight-note" rows="3" placeholder="Why it matters to you"></textarea>
  <div class="popover-actions">
    <button type="button" class="link-button" data-action="delete-highlight">Delete highlight</button>
    <button type="button" class="button" data-action="close-popover">Done</button>
  </div>
</div>`,
    { bodyClass: 'fills-screen', script: '/application.js' },
  );
}

// The Résumé as a paper page: an iframe of the standalone page, scaled to the column by public/application.js.
// v changes with the content, so a new Résumé reloads the frame.
function resumeColumn(application: Application) {
  if (!application.resume.trim()) {
    return html`<section class="card">
      <h2 class="label">Résumé</h2>
      <p class="muted">Your Agent will tailor the Résumé here. New Applications start from the Base résumé in your <a href="/profile">Profile</a>.</p>
    </section>`;
  }
  const path = `/applications/${application.id}/resume`;
  return html`<header class="resume-head">
    <h2 class="label">Résumé</h2>
    <a href="${path}" target="_blank">Open</a>
    <a href="${path}?print" target="_blank" class="button">Download PDF</a>
  </header>
  <div class="resume-warning" role="status" hidden></div>
  <div class="resume-frame"><iframe src="${path}?embed&amp;v=${version(application.resume)}" title="Résumé" scrolling="no"></iframe></div>`;
}

function version(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}

function glance(application: Application) {
  return html`<h1>${application.company} · ${application.role}</h1>
  <div class="facts">
    ${application.pay && html`<span>${application.pay}</span>`}
    ${application.location && html`<span>${application.location}</span>`}
    <form method="post" action="/applications/${application.id}/stage" class="stage">
      <label class="visually-hidden" for="stage">Stage</label>
      <select id="stage" name="stage" class="pill" onchange="this.form.submit()">
        ${stageChoices.map(
          (choice) => html`<option value="${choice}" ${choice === stageLabel(application) && 'selected'}>${choice}</option>`,
        )}
      </select>
      <noscript><button class="button secondary">Save</button></noscript>
    </form>
    ${isWebLink(application.link) && html`<a href="${application.link}" target="_blank" rel="noreferrer">Posting ↗</a>`}
  </div>`;
}

function posting(application: Application) {
  return html`<div class="posting-text">${application.posting}</div>`;
}

const tabNames: Record<HighlightTab, string> = { posting: 'posting', research: 'research' };

function markdownOr(markdown: string, empty: string) {
  if (!markdown.trim()) return html`<p class="muted empty-state">${empty}</p>`;
  return html`<div class="markdown">${{ html: renderMarkdown(markdown) }}</div>`;
}

function noteList(application: Application) {
  if (application.notes.length === 0) {
    return html`<p class="muted">No Notes yet. Your Agent adds one when it reads something about this Application, such as an interview invite in your email.</p>`;
  }
  return application.notes.map(
    (note) => html`<article class="card note" data-note-id="${note.id}">
      <p class="meta"><strong>${shortDate(note.createdAt)}</strong> · ${note.author === 'Agent' ? 'Agent' : 'You'}${note.source && ` · from ${note.source}`}</p>
      <p class="note-text">${note.text}</p>
      <div class="note-actions">
        <button type="button" class="link-button" data-action="edit-note">Edit</button>
        <button type="button" class="link-button" data-action="delete-note">Delete</button>
      </div>
    </article>`,
  );
}

function count(items: unknown[]) {
  return items.length > 0 ? ` ${items.length}` : '';
}

function highlightList(application: Application) {
  if (application.highlights.length === 0) {
    return html`<p class="muted">Select text in the Posting or Research to highlight what matters to you, then click it to say why. Your Agent reads your Highlights.</p>`;
  }
  return html`<ul class="highlight-list">${application.highlights.map(
    (highlight) => html`<li class="card" data-highlight-id="${highlight.id}">
      ${highlight.found
        ? html`<button type="button" class="quote" data-action="show-highlight">${highlight.quote}</button>`
        : html`<p class="quote">${highlight.quote}</p>`}
      <p class="meta">${capitalize(tabNames[highlight.tab])}${!highlight.found && html` · <strong>Not found in the ${tabNames[highlight.tab]}</strong>`}</p>
      <textarea class="highlight-note" data-highlight-note rows="1" aria-label="Note" placeholder="Why it matters to you">${highlight.note}</textarea>
      <button type="button" class="link-button" data-action="delete-highlight">Delete</button>
    </li>`,
  )}</ul>`;
}

// JSON inside <script> must not contain "</script>" or "<!--".
function jsonForScript(value: unknown) {
  return { html: JSON.stringify(value).replaceAll('<', '\\u003c') };
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function fieldBox(field: Field) {
  const id = `field-${field.id}`;
  const shape = JSON.stringify([field.label, field.kind, field.options, field.required]);
  return html`<div class="field" data-field-id="${field.id}" data-shape="${shape}">
    <label ${field.kind !== 'file' && html`for="${id}"`}>${field.label}${field.required && html`<span class="muted"> *</span>`}<span class="saved" aria-live="polite"></span></label>
    ${control(field, id)}
  </div>`;
}

function control(field: Field, id: string) {
  switch (field.kind) {
    case 'short_text':
      return html`<input id="${id}" class="answer" value="${field.answer}" autocomplete="off">`;
    case 'long_text':
      // The parser drops one newline right after <textarea>, so an Answer starting with a blank line survives.
      return html`<textarea id="${id}" class="answer" rows="3">\n${field.answer}</textarea>`;
    case 'choice':
      return html`<select id="${id}" class="answer">
      <option value="">Choose…</option>
      ${field.options.map((option) => html`<option ${option === field.answer && 'selected'}>${option}</option>`)}
    </select>`;
    case 'file':
      return html`<p class="file-note muted">${
        /résumé|resume|\bcv\b/i.test(field.label)
          ? html`Attach the <a href="#resume">Résumé</a> from the right column.`
          : 'Attach this file on the employer’s form.'
      }</p>`;
  }
}

function isWebLink(link: string) {
  return /^https?:\/\//i.test(link);
}
