import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, loadExample, acme, postFromPage, startDossier } from './helpers.ts';

const starters = ['Career history', 'Accomplishments', 'Base résumé', 'Voice', 'Criteria', 'Stories'];

test('loading the Example from the first-run page creates its Profile documents and its Application', async () => {
  const dossier = await startDossier();
  assert.match((await dossier.page('/')).text, /<form method="post" action="\/example"[^]*Try the Example<\/button>/);

  await loadExample(dossier);

  const home = (await dossier.page('/')).text;
  assert.match(home, /class="company">Acme</);
  assert.match(home, /Product Engineer <span class="muted">· Example<\/span>/);
  assert.match(home, /Remove the Example<\/button>/);
  assert.doesNotMatch(home, /Try the Example/);

  const profile = await call(dossier, 'get_profile');
  assert.deepEqual(profile.value.documents.map((d: { name: string }) => d.name), starters);
  assert.ok(profile.value.documents.every((d: { example?: boolean }) => d.example === true), 'the Agent sees they are the Example');
  const profilePage = (await dossier.page('/profile')).text;
  for (const name of starters) assert.match(profilePage, new RegExp(`<span>${name}</span>`));

  const [listed] = (await call(dossier, 'list_applications')).value;
  assert.equal(listed.example, true);
  const application = (await call(dossier, 'get_application', { id: listed.id })).value;
  assert.equal(application.posting, acme.posting);
  assert.equal(application.fields.length, 8);
  assert.match(application.resume, /^<h1>Alex Martin<\/h1>/);
  const fits = await call(dossier, 'set_resume', { id: listed.id, html: application.resume });
  assert.equal(fits.value.warning, undefined, 'the Example Résumé fits on one page');

  await loadExample(dossier);
  assert.equal((await call(dossier, 'list_applications')).value.length, 1, 'loading twice adds nothing');
});

test("removing the Example leaves everything the Candidate made, including a document the Example's has the name of", async () => {
  const dossier = await startDossier();
  await call(dossier, 'set_profile_document', { name: 'Voice', text: 'My own voice.' });
  await loadExample(dossier);
  await call(dossier, 'set_profile_document', { name: 'Portfolio', text: 'My projects.' });
  const mine = await call(dossier, 'add_application', { ...acme, company: 'Contoso' });

  const voice = await call(dossier, 'get_profile', { names: ['Voice'] });
  assert.deepEqual(voice.value.documents.map((d: { text: string }) => d.text), ['My own voice.'], 'the Example never overwrites');

  assert.equal((await postFromPage(dossier, '/example/remove')).status, 303);

  const profile = await call(dossier, 'get_profile');
  assert.deepEqual(
    profile.value.documents.map((d: { name: string; text: string }) => [d.name, d.text]),
    [['Voice', 'My own voice.'], ['Portfolio', 'My projects.']],
  );
  const listed = (await call(dossier, 'list_applications')).value;
  assert.deepEqual(listed.map((a: { id: number }) => a.id), [mine.value.id]);
  const home = (await dossier.page('/')).text;
  assert.match(home, /Contoso/);
  assert.doesNotMatch(home, /Remove the Example/);
});
