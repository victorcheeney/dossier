import { escapeHtml } from '../../../core/text.ts';
export { escapeHtml } from '../../../core/text.ts';
export type Html = { readonly html: string };

export function html(strings: TemplateStringsArray, ...values: unknown[]): Html {
  let out = strings[0];
  values.forEach((value, i) => {
    out += render(value) + strings[i + 1];
  });
  return { html: out };
}

function render(value: unknown): string {
  if (value === null || value === undefined || value === false) return '';
  if (Array.isArray(value)) return value.map(render).join('');
  if (typeof value === 'object' && 'html' in value) return (value as Html).html;
  return escapeHtml(String(value));
}

export function page(
  title: string,
  active: 'applications' | 'profile' | null,
  body: Html,
  options: { bodyClass?: string; script?: string } = {},
): string {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Dossier</title>
<link rel="stylesheet" href="/style.css">
</head>
<body class="${options.bodyClass ?? ''}">
<nav class="topbar">
  <a class="brand" href="/">Dossier</a>
  <a href="/" class="${active === 'applications' ? 'on' : ''}">Applications</a>
  <a href="/profile" class="${active === 'profile' ? 'on' : ''}">Profile</a>
</nav>
${body}
${options.script && html`<script type="module" src="${options.script}"></script>`}
</body>
</html>`.html;
}

export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
