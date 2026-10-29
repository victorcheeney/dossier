import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, listenToProfile, postFromPage, startDossier } from './helpers.ts';

const prompt = /Help me build my Dossier Profile\. Ask me where my past work lives/;

async function profile(dossier: Awaited<ReturnType<typeof startDossier>>, names?: string[]) {
  const result = await call(dossier, 'get_profile', names ? { names } : {});
  assert.equal(result.isError, false, result.text);
  return result.value;
}

const texts = (value: { documents: { name: string; text: string }[] }) =>
  Object.fromEntries(value.documents.map((d) => [d.name, d.text]));

test('an empty Profile shows the starter prompt with a Copy button on the Profile page and the first-run page', async () => {
  const dossier = await startDossier();

  for (const path of ['/profile', '/']) {
    const { text } = await dossier.page(path);
    assert.match(text, prompt);
    assert.match(text, /data-copy="starter-prompt">Copy</);
  }
  const { text } = await dossier.page('/profile');
  for (const starter of ['Career history', 'Accomplishments', 'Base résumé', 'Voice', 'Criteria', 'Stories']) {
    assert.match(text, new RegExp(`<button class="suggestion" name="name" value="${starter}">`));
  }

  await call(dossier, 'set_profile_document', { name: 'Voice', text: 'Plain words.' });
  assert.doesNotMatch((await dossier.page('/profile')).text, prompt);
  assert.doesNotMatch((await dossier.page('/')).text, prompt);
});

test("the Agent's documents show on the Profile page with word counts, and come back from get_profile", async () => {
  const dossier = await startDossier();
  const page = await listenToProfile(dossier);

  const created = await call(dossier, 'set_profile_document', { name: 'Career history', text: '## Roles\n\n- Engineer at <Acme>' });
  assert.equal(created.isError, false, created.text);
  assert.equal(created.value.created, true);
  assert.deepEqual(await page.next(), { what: 'profile' });
  await call(dossier, 'set_profile_document', { name: 'Voice', text: 'Plain words, short sentences.' });

  const replaced = await call(dossier, 'set_profile_document', { name: 'voice', text: 'Short sentences.' });
  assert.equal(replaced.value.created, false);
  assert.equal(replaced.value.name, 'Voice');

  const { text } = await dossier.page('/profile');
  assert.match(text, /<span>Career history<\/span><small>5 words<\/small>/);
  assert.match(text, /<span>Voice<\/span><small>2 words<\/small>/);
  assert.match(text, /<textarea id="doc-body" class="doc-body" spellcheck="false">\n## Roles\n\n- Engineer at &lt;Acme&gt;<\/textarea>/);
  assert.doesNotMatch(text, /value="Voice">Voice<\/button>/, 'an existing starter is no longer suggested');

  const all = await profile(dossier);
  assert.deepEqual(texts(all), { 'Career history': '## Roles\n\n- Engineer at <Acme>', Voice: 'Short sentences.' });
  assert.match(all.documents[0].updated, /^\d{4}-\d\d-\d\dT/);

  const some = await profile(dossier, ['voice', 'Stories']);
  assert.deepEqual(texts(some), { Voice: 'Short sentences.' });
  assert.deepEqual(some.notFound, ['Stories']);
});

test('MCP edits a Profile passage and names available documents when one is missing', async () => {
  const dossier = await startDossier();
  await call(dossier, 'set_profile_document', { name: 'Accomplishments', text: '- Cut CPU by 65%.\n- Cut CI time by 50%.' });

  const edited = await call(dossier, 'edit_profile_document', { name: 'Accomplishments', passage: 'CPU by 65%', replacement: 'database CPU by 65%' });
  assert.equal(edited.isError, false, edited.text);
  assert.deepEqual(texts(await profile(dossier)), { Accomplishments: '- Cut database CPU by 65%.\n- Cut CI time by 50%.' });

  const unknown = await call(dossier, 'edit_profile_document', { name: 'Stories', passage: 'a', replacement: 'b' });
  assert.equal(unknown.isError, true);
  assert.match(unknown.text, /"Accomplishments"/);

  assert.deepEqual(texts(await profile(dossier)), { Accomplishments: '- Cut database CPU by 65%.\n- Cut CI time by 50%.' });
});

test('delete_profile_document removes the document from the page and from get_profile', async () => {
  const dossier = await startDossier();
  await call(dossier, 'set_profile_document', { name: 'Criteria', text: 'Remote.' });
  await call(dossier, 'set_profile_document', { name: 'Stories', text: 'STAR.' });

  const deleted = await call(dossier, 'delete_profile_document', { name: 'Criteria' });
  assert.equal(deleted.isError, false, deleted.text);

  assert.deepEqual(texts(await profile(dossier)), { Stories: 'STAR.' });
  assert.doesNotMatch((await dossier.page('/profile')).text, /<span>Criteria<\/span>/);
});

test("the Candidate's edits on the Profile page reach the Agent", async () => {
  const dossier = await startDossier();

  const created = await postFromPage(dossier, '/profile/documents', { name: 'Voice' });
  assert.equal(created.status, 303);
  const path = created.headers.get('location')!;
  assert.match(path, /^\/profile\/\d+$/);

  const page = await listenToProfile(dossier);
  assert.equal((await postFromPage(dossier, path, { text: 'I write plainly.' })).status, 204);
  assert.deepEqual(await page.next(), { what: 'profile' });
  assert.equal((await postFromPage(dossier, path, { name: 'My voice' })).status, 204);
  assert.deepEqual(texts(await profile(dossier)), { 'My voice': 'I write plainly.' });

  const blank = await postFromPage(dossier, '/profile/documents');
  const other = blank.headers.get('location')!;
  assert.match((await dossier.page(other)).text, /value="Untitled"/);
  assert.equal((await postFromPage(dossier, other, { name: 'my voice' })).status, 409);

  assert.equal((await postFromPage(dossier, `${other}/delete`)).status, 303);
  assert.deepEqual(texts(await profile(dossier)), { 'My voice': 'I write plainly.' });
  assert.equal((await dossier.page(other)).status, 404);
});
