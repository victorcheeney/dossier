import type { Application } from '../../../core/domain.ts';
import { plainText } from '../../../core/resume.ts';
import { html } from './html.ts';

// The Résumé on its own: one paper page in the app's template, for the iframe in the right column (embed),
// for opening in a tab, and for printing to PDF. resume is already sanitized.
export function resumeDocument(application: Pick<Application, 'company' | 'resume'>, options: { embed: boolean }): string {
  const name = plainText(application.resume.match(/<h1>([^]*?)<\/h1>/)?.[1] ?? '');
  const title = name ? `${name} - Résumé - ${application.company}` : `Résumé - ${application.company}`;
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="/resume.css">
</head>
<body class="${options.embed ? 'embed' : ''}">
<article class="paper">${{ html: application.resume }}</article>
<script type="module" src="/resume-page.js"></script>
</body>
</html>`.html;
}
