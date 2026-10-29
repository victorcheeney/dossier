// Copy buttons: data-copy names the element whose text goes to the clipboard.
document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy]');
  if (!button) return;
  const text = document.getElementById(button.dataset.copy).textContent.trim();
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch {
    getSelection().selectAllChildren(document.getElementById(button.dataset.copy));
    button.textContent = 'Press Cmd+C';
  }
  setTimeout(() => (button.textContent = 'Copy'), 2000);
});
