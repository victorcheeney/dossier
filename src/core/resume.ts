import { escapeHtml } from './text.ts';

// The Résumé is HTML the Agent writes: content only. The app's one template (public/resume.css) styles it,
// so only structural tags survive and no attribute does, except a web or mailto href on a link.

const allowedTags = new Set([
  'h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'a', 'br', 'hr', 'small', 'span', 'div', 'section', 'code',
]);
const voidTags = new Set(['br', 'hr']);
// Elements whose content is dropped with them, not shown as text.
const droppedWithContent = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'textarea', 'select', 'title', 'head', 'svg', 'math', 'xmp', 'noembed', 'noframes',
]);

export function sanitizeResume(input: string): string {
  let out = '';
  let at = 0;
  const tag = /<!--[^]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|<![^>]*>|<\?[^>]*>/g;
  for (let match = tag.exec(input); match; match = tag.exec(input)) {
    out += text(input.slice(at, match.index));
    at = tag.lastIndex;
    const [, closing, rawName, attributes] = match;
    if (rawName === undefined) continue; // A comment, doctype or processing instruction.
    const name = rawName.toLowerCase();
    if (droppedWithContent.has(name)) {
      if (closing) continue;
      const end = new RegExp(`</${name}\\s*>`, 'ig');
      end.lastIndex = at;
      const found = end.exec(input);
      at = found ? end.lastIndex : input.length;
      tag.lastIndex = at;
      continue;
    }
    if (!allowedTags.has(name)) continue;
    if (closing) {
      if (!voidTags.has(name)) out += `</${name}>`;
      continue;
    }
    const href = name === 'a' ? safeHref(attributes) : null;
    out += href ? `<a href="${escapeHtml(href)}">` : `<${name}>`;
  }
  return out + text(input.slice(at));
}

// Text between tags: a stray < or > becomes text; entities such as &amp; and &nbsp; stay as written.
function text(chunk: string) {
  return chunk.replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/&(?![a-zA-Z][a-zA-Z0-9]*;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');
}

function safeHref(attributes: string): string | null {
  const match = attributes.match(/(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
  if (!match) return null;
  const href = (match[1] ?? match[2] ?? match[3]).trim().replaceAll('&amp;', '&');
  return /^(https?:\/\/|mailto:)[^\s]/i.test(href) ? href : null;
}

// A rough server-side check that the Résumé fits on one Letter page in the template, so set_resume can warn
// the Agent. It counts wrapped lines per block from character counts, calibrated against the template at
// 9.3pt Inter (line height 1.3) on a 7.3in-wide text block. It ignores real glyph widths and where lines actually break, so it
// can be a few lines off either way; the Résumé page measures the real layout and shows the exact warning.
const pageLines = 59;
const blockLines: Record<string, { chars: number; extra: number }> = {
  h1: { chars: 40, extra: 0.6 },
  h2: { chars: 114, extra: 0.9 },
  h3: { chars: 114, extra: 0.45 },
  h4: { chars: 114, extra: 0.35 },
  li: { chars: 119, extra: 0.05 },
  p: { chars: 122, extra: 0.25 },
};

export function estimatedLines(html: string): number {
  let lines = 0;
  for (const match of html.matchAll(/<(h1|h2|h3|h4|li|p)>([^]*?)(?=<\/?(?:h1|h2|h3|h4|li|p|ul|ol|div|section)>|$)/g)) {
    const { chars, extra } = blockLines[match[1]];
    const length = plainText(match[2]).length;
    if (length === 0) continue;
    lines += Math.ceil(length / chars) * (match[1] === 'h1' ? 1.6 : 1) + extra;
  }
  return Math.round(lines);
}

export function overflowWarning(html: string): string | null {
  const lines = estimatedLines(html);
  if (lines <= pageLines) return null;
  return `This Résumé probably runs onto a second page (about ${lines} lines; one page holds about ${pageLines}). Shorten it unless the Candidate wants two pages. The Résumé column on the page shows the exact overflow.`;
}

export function plainText(html: string) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-zA-Z0-9#]+;/g, 'x')
    .replace(/\s+/g, ' ')
    .trim();
}
