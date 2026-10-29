import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addAcme, call, startDossier } from './helpers.ts';

test('the Agent moves an Application to Applied and the list and page show it', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);

  const moved = await call(dossier, 'set_stage', { id: added.id, stage: 'Applied' });
  assert.equal(moved.isError, false, moved.text);

  const applied = await call(dossier, 'list_applications', { stage: 'Applied' });
  assert.deepEqual(applied.value.map((a: { id: number }) => a.id), [added.id]);
  assert.deepEqual((await call(dossier, 'list_applications', { stage: 'Preparing' })).value, []);

  assert.match((await dossier.page('/')).text, /class="pill">Applied</);
  assert.match((await dossier.page(`/applications/${added.id}`)).text, /<option value="Applied" selected>/);
});

test('Closed with a reason shows the reason', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);

  await call(dossier, 'set_stage', { id: added.id, stage: 'Closed', reason: 'withdrew' });

  const { value } = await call(dossier, 'get_application', { id: added.id });
  assert.deepEqual([value.stage, value.closedReason], ['Closed', 'withdrew']);
  assert.match((await dossier.page('/')).text, /class="pill">Closed · withdrew</);
});

test('the Candidate changes the Stage on the page', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);

  const response = await fetch(`${dossier.app.url}/applications/${added.id}/stage`, {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams({ stage: 'Closed · accepted' }),
  });
  assert.equal(response.status, 303);

  const { value } = await call(dossier, 'get_application', { id: added.id });
  assert.deepEqual([value.stage, value.closedReason], ['Closed', 'accepted']);
  assert.match((await dossier.page(`/applications/${added.id}`)).text, /<option value="Closed · accepted" selected>/);
});
