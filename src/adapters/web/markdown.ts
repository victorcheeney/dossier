import { parseMarkdown, type Inline } from '../../core/markdown.ts';
import { escapeHtml } from './pages/html.ts';

export function renderMarkdown(markdown: string): string {
  return parseMarkdown(markdown).map((block) => {
    if ('heading' in block) {
      const level = Math.min(block.heading + 1, 6);
      return `<h${level}>${inline(block.content)}</h${level}>`;
    }
    if ('paragraph' in block) return `<p>${inline(block.paragraph)}</p>`;
    return `<ul>\n${block.list.map((item) => `<li>${inline(item)}</li>`).join('\n')}\n</ul>`;
  }).join('\n');
}

function inline(content: Inline[]): string {
  return content.map((part) => {
    if ('text' in part) return escapeHtml(part.text);
    if ('bold' in part) return `<strong>${inline(part.bold)}</strong>`;
    return `<a href="${escapeHtml(part.link)}" target="_blank" rel="noreferrer">${inline(part.label)}</a>`;
  }).join('');
}
