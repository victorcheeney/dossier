// The small Markdown the Agent writes: headings, paragraphs, bullet lists, **bold** and [links](https://…).
// Anything else stays as text. The web adapter renders these blocks as HTML; Highlights match their text.

export type Inline = { text: string } | { bold: Inline[] } | { link: string; label: Inline[] };
export type Block =
  | { heading: number; content: Inline[] }
  | { paragraph: Inline[] }
  | { list: Inline[][] };

export function parseMarkdown(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) blocks.push({ paragraph: parseInline(paragraph.join(' ')) });
    if (list.length > 0) blocks.push({ list: list.map(parseInline) });
    paragraph = [];
    list = [];
  };

  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const item = line.match(/^\s*[-*]\s+(.*)$/);
    if (heading) {
      flush();
      blocks.push({ heading: heading[1].length, content: parseInline(heading[2].trim()) });
    } else if (item) {
      if (paragraph.length > 0) flush();
      list.push(item[1]);
    } else if (line.trim() === '') {
      flush();
    } else if (list.length > 0 && /^\s/.test(line)) {
      list[list.length - 1] += ` ${line.trim()}`;
    } else {
      if (list.length > 0) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

// The text a reader sees, as the page's Highlights match it.
export function markdownText(markdown: string): string {
  return parseMarkdown(markdown)
    .map((block) => {
      if ('heading' in block) return inlineText(block.content);
      if ('paragraph' in block) return inlineText(block.paragraph);
      return `\n${block.list.map(inlineText).join('\n')}\n`;
    })
    .join('\n');
}

function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(/\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    out.push({ text: text.slice(last, match.index) });
    const [whole, bold, label, url] = match;
    if (bold !== undefined) out.push({ bold: parseInline(bold) });
    else if (/^https?:\/\//i.test(url)) out.push({ link: url, label: parseInline(label) });
    else out.push({ text: whole });
    last = match.index + whole.length;
  }
  out.push({ text: text.slice(last) });
  return out;
}

function inlineText(content: Inline[]): string {
  return content.map((part) => ('text' in part ? part.text : inlineText('bold' in part ? part.bold : part.label))).join('');
}
