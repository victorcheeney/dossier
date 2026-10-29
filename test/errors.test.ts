import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addAcme, call, postFromPage, startDossier } from './helpers.ts';

test('MCP and HTTP report the same core refusal for an empty Note and keep existing Notes', async () => {
  const dossier = await startDossier();
  const { id } = await addAcme(dossier);
  const saved = await call(dossier, 'add_note', { id, text: ' Saved. ', source: ' email ' });
  assert.equal(saved.isError, false);
  assert.equal(saved.value.note.text, 'Saved.');
  assert.equal(saved.value.note.source, 'email');
  const mcp = await call(dossier, 'add_note', { id, text: '\t ', source: '' });
  const http = await postFromPage(dossier, `/applications/${id}/notes`, { text: ' \n ' });
  assert.equal(mcp.isError, true);
  assert.equal(http.status, 400);
  assert.equal(await http.text(), mcp.text);
  assert.match(mcp.text, /Note.*text/);
  const application = (await call(dossier, 'get_application', { id })).value;
  assert.equal(application.notes.length, 1);
  const created = await postFromPage(dossier, `/applications/${id}/notes`, { text: 'Candidate Note.' });
  const noteId = (await created.json() as { id: number }).id;
  const edit = await postFromPage(dossier, `/applications/${id}/notes/${noteId}`, { text: '' });
  assert.equal(edit.status, 400);
  assert.equal(await edit.text(), mcp.text);
  assert.equal((await call(dossier, 'get_application', { id })).value.notes[0].text, 'Candidate Note.');
});

test('missing records become an MCP tool error or HTTP 404', async () => {
  const dossier = await startDossier();
  const mcp = await call(dossier, 'get_application', { id: 999 });
  const http = await dossier.page('/applications/999');
  assert.equal(mcp.isError, true);
  assert.equal(http.status, 404);
  assert.equal(http.text, mcp.text);
  const { id } = await addAcme(dossier);
  const foreign = await addAcme(dossier);
  const response = await postFromPage(dossier, `/applications/${id}/answers/${foreign.fields[0].id}`, { text: 'Wrong Application' });
  assert.equal(response.status, 404);
});
