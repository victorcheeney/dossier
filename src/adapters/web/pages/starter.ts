import { html } from './html.ts';

export const starterPrompt =
  "Help me build my Dossier Profile. Ask me where my past work lives, such as a résumé, LinkedIn, Notion, GitHub or past reviews, and what I'm looking for next. Then draft each Profile document for me to check.";

// The prompt a Candidate with an empty Profile pastes into their Agent, with a Copy button (public/copy.js).
export function starterPromptCard() {
  return html`<section class="card starter">
    <h2 class="label">Build your Profile with your Agent</h2>
    <p>Paste this in your Agent's chat. It asks where your past work lives and drafts each document for you to check.</p>
    <p class="prompt" id="starter-prompt">${starterPrompt}</p>
    <button type="button" class="button" data-copy="starter-prompt">Copy</button>
  </section>`;
}
