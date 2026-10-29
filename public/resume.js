// The Résumé column: scales the paper page to the column width, and shows the page's own one-page check.

const pageWidth = 816; // 8.5in at 96px per inch.
const pageHeight = 1056; // 11in.

export function startResume({ onRegionChange }) {
  const observer = new ResizeObserver(() => fit());
  let frameHeight = pageHeight;

  function fit() {
    const box = document.querySelector('.resume-frame');
    const iframe = box?.querySelector('iframe');
    if (!iframe) return;
    const scale = box.clientWidth / pageWidth;
    iframe.style.width = `${pageWidth}px`;
    iframe.style.height = `${frameHeight}px`;
    iframe.style.transform = `scale(${scale})`;
    box.style.height = `${frameHeight * scale}px`;
  }

  function watch(region) {
    frameHeight = pageHeight;
    observer.disconnect();
    const box = region.querySelector('.resume-frame');
    if (box) observer.observe(box);
    fit();
  }

  addEventListener('message', (event) => {
    const iframe = document.querySelector('.resume-frame iframe');
    if (event.origin !== location.origin || !iframe || event.source !== iframe.contentWindow || !event.data?.resume) return;
    show(event.data.resume);
  });

  function show({ overflow, lines, height }) {
    frameHeight = Math.max(pageHeight, height);
    fit();
    const warning = document.querySelector('.resume-warning');
    warning.hidden = !overflow;
    warning.replaceChildren();
    if (!overflow) return;
    const title = document.createElement('strong');
    title.textContent = 'Runs onto page 2';
    const list = document.createElement('ul');
    for (const line of lines) list.append(Object.assign(document.createElement('li'), { textContent: line }));
    warning.append(title, Object.assign(document.createElement('p'), { textContent: 'These lines are past the end of page 1:' }), list);
  }

  watch(document.querySelector('[data-region="resume"]'));
  // The page may have measured itself before this script listened.
  const measured = document.querySelector('.resume-frame iframe')?.contentWindow?.resumeFit;
  if (measured) show(measured);
  onRegionChange('resume', watch);
}
