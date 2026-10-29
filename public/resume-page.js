// The standalone Résumé page: measures whether the content fits on one Letter page, marks where page 1 ends,
// tells the Application page (when shown in its iframe), and opens the print dialog for ?print.

const params = new URLSearchParams(location.search);
const paper = document.querySelector('.paper');
const inch = 96;
const pageBottom = 11 * inch - 0.45 * inch; // Where page 1's text block ends, from the top of the paper.

function measure() {
  const top = paper.getBoundingClientRect().top;
  const blocks = [...paper.querySelectorAll('h1, h2, h3, h4, p, li')].filter((block) => !block.querySelector('p, li, ul, ol'));
  const bottom = (element) => element.getBoundingClientRect().bottom - top;
  const contentBottom = Math.max(0, ...[...paper.children].map(bottom));
  const overflowing = blocks.filter((block) => bottom(block) > pageBottom + 0.5);
  return {
    overflow: contentBottom > pageBottom + 0.5,
    lines: overflowing.slice(0, 3).map((block) => {
      const text = block.textContent.replace(/\s+/g, ' ').trim();
      return text.length > 140 ? `${text.slice(0, 140)}…` : text;
    }),
  };
}

function markPageBreak(result) {
  if (!result.overflow) return;
  const line = document.createElement('div');
  line.className = 'page-break';
  line.innerHTML = '<span>End of page 1</span>';
  paper.append(line);
  if (!params.has('embed')) {
    const note = document.createElement('p');
    note.className = 'overflow-note';
    note.textContent = 'Runs onto page 2. The PDF will have two pages.';
    paper.before(note);
  }
}

await document.fonts.ready;
const result = measure();
markPageBreak(result);
window.resumeFit = { ...result, height: document.documentElement.scrollHeight };
if (parent !== window) parent.postMessage({ resume: window.resumeFit }, location.origin);
if (params.has('print')) print();
