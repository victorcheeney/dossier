// Notes: add one, edit or delete any, newest first. A Note being edited is held back from live refreshes.

export function startNotes({ post, refresh, rendered }) {
  const addForm = document.querySelector('.note-add');

  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = addForm.elements.text.value.trim();
    if (!text) return;
    await post('/notes', { text });
    addForm.reset();
    refresh();
  });

  function stopEditing(note) {
    note.classList.remove('editing');
    if (note.contains(document.activeElement)) document.activeElement.blur();
    rendered.delete('notes'); // Redraw the list even when the Note did not change.
    refresh();
  }

  document.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const note = event.target.closest('[data-note-id]');
    if (!note || !action) return;
    const path = `/notes/${note.dataset.noteId}`;

    if (action === 'edit-note') {
      const text = note.querySelector('.note-text');
      const editor = document.createElement('textarea');
      editor.className = 'answer';
      editor.value = text.textContent;
      text.replaceWith(editor);
      note.querySelector('.note-actions').innerHTML =
        '<button type="button" class="button" data-action="save-note">Save</button> <button type="button" class="link-button" data-action="cancel-note">Cancel</button>';
      note.classList.add('editing');
      editor.style.height = `${editor.scrollHeight + 2}px`;
      editor.focus();
    }
    if (action === 'save-note') {
      const text = note.querySelector('textarea').value.trim();
      if (text) await post(path, { text });
      stopEditing(note);
    }
    if (action === 'cancel-note') stopEditing(note);
    if (action === 'delete-note' && confirm('Delete this Note?')) {
      await post(`${path}/delete`);
      refresh();
    }
  });
}
