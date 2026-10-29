import { type ProfileDocument, profileStarters, sameName, wordCount } from '../../../core/domain.ts';
import { html, page } from './html.ts';
import { starterPromptCard } from './starter.ts';

// The Profile page: documents on the left, the selected one editable on the right.
// public/profile.js relies on data-region="documents", data-document, .doc-title and .doc-body.
export function profilePage(documents: ProfileDocument[], selected: ProfileDocument | null): string {
  return page(
    selected ? `${selected.name} · Profile` : 'Profile',
    'profile',
    html`<div class="profile" data-document="${selected?.id ?? ''}">
  <aside class="side">
    <h1>Profile</h1>
    <p class="muted">What your Agent knows about you. Shared by every Application.</p>
    <div data-region="documents">${documentList(documents, selected)}</div>
  </aside>
  <main class="editor" data-region="editor">${selected ? editor(selected) : emptyEditor(documents)}</main>
</div>`,
    { bodyClass: 'fills-screen', script: '/profile.js' },
  );
}

function documentList(documents: ProfileDocument[], selected: ProfileDocument | null) {
  const missing = profileStarters.filter((starter) => !documents.some((d) => sameName(d.name, starter)));
  return html`<nav class="doc-list">${documents.map(
    (document) => html`<a class="doc-item ${document.id === selected?.id ? 'on' : ''}" href="/profile/${document.id}">
      <span>${document.name}</span><small>${words(document.text)}</small>
    </a>`,
  )}</nav>
  <form method="post" action="/profile/documents"><button class="button secondary">New document</button></form>
  ${missing.length > 0 && html`<form method="post" action="/profile/documents" class="suggested">
    <h2 class="label">Suggested</h2>
    ${missing.map((name) => html`<button class="suggestion" name="name" value="${name}">${name}</button>`)}
  </form>`}`;
}

function words(text: string) {
  const count = wordCount(text);
  return `${count} ${count === 1 ? 'word' : 'words'}`;
}

function editor(document: ProfileDocument) {
  return html`<label class="visually-hidden" for="doc-title">Document name</label>
  <input id="doc-title" class="doc-title" value="${document.name}" autocomplete="off" spellcheck="false">
  <div class="meta">
    <span class="status" aria-live="polite"></span>
    <span>${sameName(document.name, 'Base résumé')
      ? 'The résumé every new Application starts from, as HTML. Your Agent tailors a copy for each Posting.'
      : 'Markdown. Your Agent reads this with get_profile.'}</span>
    <form method="post" action="/profile/${document.id}/delete" onsubmit="return confirm('Delete this document? Your Agent will no longer see it.')">
      <button class="link-button">Delete document</button>
    </form>
  </div>
  <label class="visually-hidden" for="doc-body">${document.name}</label>
  <textarea id="doc-body" class="doc-body" spellcheck="false">\n${document.text}</textarea>`;
}

function emptyEditor(documents: ProfileDocument[]) {
  if (documents.length > 0) return html`<p class="muted">Choose a document on the left.</p>`;
  return html`<div class="empty-profile">${starterPromptCard()}
  <p class="muted">Or write it yourself: pick a suggested document on the left, or start a new one. None is required.</p></div>`;
}
