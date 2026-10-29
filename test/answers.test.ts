import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addAcme, call, listen, postFromPage, startDossier } from './helpers.ts';

type Field = { id: number; label: string; answer: string };
const field = (fields: Field[], label: string) => fields.find((f) => f.label === label)!;

test('the page shows one box per Field, by kind', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);
  const { text } = await dossier.page(`/applications/${added.id}`);
  const ids = Object.fromEntries(added.fields.map((f: Field) => [f.label, f.id]));

  assert.match(text, new RegExp(`<input id="field-${ids['Full name']}" class="answer"`));
  assert.match(text, new RegExp(`<textarea id="field-${ids['Why Acme?']}" class="answer"`));
  assert.match(text, new RegExp(`<select id="field-${ids['Are you in Canada?']}" class="answer">[^]*<option ?>Yes</option>`));
  assert.match(text, /Attach the <a href="#resume">Résumé<\/a> from the right column\./);
  assert.match(text, /<script type="module" src="\/application.js"><\/script>/);
});

test("the Candidate's typing saves, and the Agent reads it", async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);
  const why = field(added.fields, 'Why Acme?');

  const saved = await postFromPage(dossier, `/applications/${added.id}/answers/${why.id}`, { text: 'I shop at small grocers.' });
  assert.equal(saved.status, 204);

  const { value } = await call(dossier, 'get_application', { id: added.id });
  assert.equal(field(value.fields, 'Why Acme?').answer, 'I shop at small grocers.');
});

test("the Agent's set_answer reaches every open page and stays on reload", async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);
  const name = field(added.fields, 'Full name');
  const page = await listen(dossier, added.id);

  const result = await call(dossier, 'set_answer', { id: added.id, label: 'Full name', text: 'Ada <Lovelace>' });
  assert.equal(result.isError, false, result.text);

  assert.deepEqual(await page.next(), { what: 'answer', fieldId: name.id });
  const { text } = await dossier.page(`/applications/${added.id}`);
  assert.match(text, new RegExp(`id="field-${name.id}" class="answer" value="Ada &lt;Lovelace&gt;"`));
});

test("one page's edit reaches the other open pages", async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);
  const why = field(added.fields, 'Why Acme?');
  const otherTab = await listen(dossier, added.id);

  await postFromPage(dossier, `/applications/${added.id}/answers/${why.id}`, { text: 'Grocers.' });

  assert.deepEqual(await otherTab.next(), { what: 'answer', fieldId: why.id });
});

test('MCP accepts a Field id and returns available labels when a Field is missing', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);
  const canada = field(added.fields, 'Are you in Canada?');

  assert.equal((await call(dossier, 'set_answer', { id: added.id, fieldId: canada.id, text: 'Yes' })).isError, false);

  const unknown = await call(dossier, 'set_answer', { id: added.id, label: 'Why us?', text: 'x' });
  assert.equal(unknown.isError, true);
  assert.match(unknown.text, /"Why Acme\?"/);

  const { value } = await call(dossier, 'get_application', { id: added.id });
  assert.equal(field(value.fields, 'Are you in Canada?').answer, 'Yes');
});

test('another website cannot change an Answer', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);
  const why = field(added.fields, 'Why Acme?');

  const response = await fetch(`${dossier.app.url}/applications/${added.id}/answers/${why.id}`, {
    method: 'POST',
    headers: { origin: 'https://evil.example' },
    body: new URLSearchParams({ text: 'pwned' }),
  });
  assert.equal(response.status, 403);
});
