import { connectCommands } from '../connect.ts';
import type { ApplicationRow } from '../../../core/domain.ts';
import { html, page, shortDate } from './html.ts';
import { starterPromptCard } from './starter.ts';
import { stageLabel } from './stage.ts';

export function homePage(
  applications: ApplicationRow[],
  mcpUrl: string,
  { profileIsEmpty, hasExample }: { profileIsEmpty: boolean; hasExample: boolean },
): string {
  if (applications.length === 0) return firstRun(mcpUrl, profileIsEmpty, hasExample);
  return page('Applications', 'applications', html`<main class="narrow">
  <h1>Applications</h1>
  ${applications.map(
    (application) => html`<a class="card row" href="/applications/${application.id}">
    <span class="company">${application.company}</span>
    <span>${application.role}${application.example && html` <span class="muted">· Example</span>`}</span>
    <span><span class="pill">${stageLabel(application)}</span></span>
    <span class="muted">${application.pay}</span>
    <span class="muted">${shortDate(application.createdAt)}</span>
  </a>`,
  )}
  ${hasExample && removeExample()}
</main>`);
}

function firstRun(mcpUrl: string, profileIsEmpty: boolean, hasExample: boolean): string {
  return page('Applications', 'applications', html`<main class="narrow">
  <h1>Applications</h1>
  <p class="lead">Connect your Agent to Dossier. Run one of these in a terminal:</p>
  ${connectCommands(mcpUrl).map(
    ({ agent, command }) => html`<section class="card connect">
    <h2 class="label">${agent}</h2>
    <code>${command}</code>
  </section>`,
  )}
  ${profileIsEmpty && html`<div class="first-profile">${starterPromptCard()}</div>`}
  <p class="next">Paste a job posting in your Agent's chat.</p>
  ${hasExample
    ? removeExample()
    : html`<form method="post" action="/example" class="card try-example">
    <h2 class="label">Not ready yet?</h2>
    <p>Try the Example: a made-up Candidate, Alex Martin, with a full Profile and an Application for a Product Engineer Posting at Acme. Remove it in one click when you're done.</p>
    <button class="button secondary">Try the Example</button>
  </form>`}
</main>`, { script: profileIsEmpty ? '/copy.js' : undefined });
}

function removeExample() {
  return html`<form method="post" action="/example/remove" class="remove-example"
    onsubmit="return confirm('Remove the Example? Its Profile documents and its Application go; anything you made stays.')">
    <button class="link-button">Remove the Example</button>
  </form>`;
}
