import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addAcme, call, acme, startDossier } from './helpers.ts';

test('an Agent connects over MCP and sees the Application tools', async () => {
  const dossier = await startDossier();
  const { tools } = await dossier.agent.listTools();
  const names = tools.map((tool) => tool.name);

  for (const name of ['add_application', 'update_application', 'list_applications', 'get_application', 'set_stage']) {
    assert.ok(names.includes(name), `${name} is missing`);
  }
  assert.ok(!names.some((name) => name.startsWith('delete') && name.includes('application')), 'the Agent cannot delete an Application');
});

test('an added Application is listed for the Agent and on the home page', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);

  const listed = await call(dossier, 'list_applications');
  assert.deepEqual(
    listed.value.map((a: { company: string; role: string; stage: string }) => [a.company, a.role, a.stage]),
    [['Acme', 'Product Engineer', 'Preparing']],
  );

  const home = await dossier.page('/');
  assert.match(home.text, new RegExp(`href="/applications/${added.id}"`));
  assert.match(home.text, /Acme/);
  assert.match(home.text, /Product Engineer/);
  assert.match(home.text, /CA\$230K–260K/);
  assert.match(home.text, /class="pill">Preparing</);
  assert.doesNotMatch(home.text, /claude mcp add/);
});

test('get_application returns the Posting and each Field with an empty Answer', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);
  const { value } = await call(dossier, 'get_application', { id: added.id });

  assert.equal(value.posting, acme.posting);
  assert.equal(value.stage, 'Preparing');
  assert.equal(value.page, `${dossier.app.url}/applications/${added.id}`);
  assert.deepEqual(
    value.fields.map((f: { label: string; kind: string; options: string[]; required: boolean; answer: string }) => [
      f.label,
      f.kind,
      f.options,
      f.required,
      f.answer,
    ]),
    [
      ['Full name', 'short_text', [], true, ''],
      ['Email', 'short_text', [], true, ''],
      ['Résumé', 'file', [], true, ''],
      ['LinkedIn or website', 'short_text', [], false, ''],
      ['Are you in Canada?', 'choice', ['Yes', 'No'], false, ''],
      ['Why Acme?', 'long_text', [], true, ''],
      ['Tell us about something you shipped end to end. What did you own, and what changed for the people who used it?', 'long_text', [], true, ''],
      ['How did you hear about us?', 'short_text', [], false, ''],
    ],
  );
});

test('update_application changes only what it is given', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);

  const updated = await call(dossier, 'update_application', {
    id: added.id,
    pay: 'CA$160K–190K',
    fields: [{ label: 'Why Acme?', kind: 'long_text', required: true }],
  });
  assert.equal(updated.isError, false, updated.text);

  const { value } = await call(dossier, 'get_application', { id: added.id });
  assert.equal(value.pay, 'CA$160K–190K');
  assert.equal(value.role, 'Product Engineer');
  assert.deepEqual(value.fields.map((f: { label: string }) => f.label), ['Why Acme?']);
});

test('the Application page shows its header and Posting', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);
  const page = await dossier.page(`/applications/${added.id}`);

  assert.equal(page.status, 200);
  assert.match(page.text, /Acme · Product Engineer/);
  assert.match(page.text, /Remote, Canada/);
  assert.match(page.text, /href="https:\/\/jobs\.example\.com\/acme\/product-engineer"/);
  assert.match(page.text, /You will ship features end to end\./);
});

test('Posting text from the Agent is shown as text, never as markup', async () => {
  const dossier = await startDossier();
  const added = await call(dossier, 'add_application', { ...acme, posting: '<script>alert(1)</script>' });
  const page = await dossier.page(`/applications/${added.value.id}`);

  assert.doesNotMatch(page.text, /<script>alert/);
  assert.match(page.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('an Application missing its Posting is refused', async () => {
  const dossier = await startDossier();
  const { posting: _, ...withoutPosting } = acme;
  const result = await call(dossier, 'add_application', withoutPosting);

  assert.equal(result.isError, true);
  assert.match(result.text, /posting/);
});

test('the Candidate deletes an Application from its page', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);

  const response = await fetch(`${dossier.app.url}/applications/${added.id}/delete`, { method: 'POST', redirect: 'manual' });
  assert.equal(response.status, 303);

  assert.equal((await dossier.page(`/applications/${added.id}`)).status, 404);
  assert.deepEqual((await call(dossier, 'list_applications')).value, []);
});

test('another website cannot delete an Application', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);

  const response = await fetch(`${dossier.app.url}/applications/${added.id}/delete`, {
    method: 'POST',
    redirect: 'manual',
    headers: { origin: 'https://evil.example' },
  });
  assert.equal(response.status, 403);
  assert.equal((await dossier.page(`/applications/${added.id}`)).status, 200);
});
