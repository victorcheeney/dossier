const demo = document.querySelector('.demo video');
const play = document.querySelector('.demo .play');
if (demo && play) {
  demo.controls = false;
  play.hidden = false;
  play.addEventListener('click', () => {
    play.hidden = true;
    demo.controls = true;
    demo.play();
  });
}

// Copy buttons for the commands, and the scroll reveal (styles.css skips it with reduced motion).
for (const button of document.querySelectorAll('.copy')) {
  button.addEventListener('click', async () => {
    const text = button.parentElement.querySelector('code').textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Select and copy';
    }
    setTimeout(() => { button.textContent = 'Copy'; }, 2000);
  });
}

if ('IntersectionObserver' in window) {
  document.documentElement.classList.add('js');
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -10% 0px' });
  for (const element of document.querySelectorAll('.reveal')) observer.observe(element);
}
