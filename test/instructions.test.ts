import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, loadExample, acme, startDossier } from './helpers.ts';

test('the Agent gets the instructions when it connects', async () => {
  const dossier = await startDossier();
  const instructions = dossier.agent.getInstructions() ?? '';

  assert.match(instructions, /Every activity in Dossier is a conversation with the Candidate/);
  assert.match(instructions, /## Claims check/);
  assert.match(instructions, /Every claim must trace to the Profile or to this conversation/);
  assert.match(instructions, /Call `read_form_fields` with the link[^]*If it fails[^]*ask the Candidate to paste the form/);
  assert.match(instructions, /## Voice and the editing pass/);
  assert.match(instructions, /Never use the Example's facts/);
});

test('an Agent adds and prepares an Application from a link Dossier cannot read, with the Example loaded', async () => {
  const failing: typeof fetch = async () => new Response('Not found', { status: 404 });
  const dossier = await startDossier({ fetch: failing });
  await loadExample(dossier);
  const link = 'https://jobs.lever.co/contoso/1b2c3d4e-0000-4000-8000-000000000000';

  const read = await call(dossier, 'read_form_fields', { link });
  assert.equal(read.isError, true);
  assert.match(read.text, /Get the Fields another way: open the form with your own browser or fetch tools, or ask the Candidate to paste the form\./);

  const added = await call(dossier, 'add_application', { ...acme, company: 'Contoso', link });
  assert.equal(added.isError, false, added.text);
  const { id } = added.value;
  assert.equal(added.value.example, undefined, "the Candidate's Application is not the Example");

  const steps = [
    await call(dossier, 'add_note', { id, text: 'Pay is above your floor; remote in Canada fits.', source: 'the Posting and your Criteria' }),
    await call(dossier, 'set_summary', { id, summary: '## The job\nOwn billing end to end.' }),
    await call(dossier, 'set_answer', { id, label: 'Why Acme?', text: 'I want to build the billing tools I used to fight with.' }),
  ];
  for (const step of steps) assert.equal(step.isError, false, step.text);

  const { text } = await dossier.page(`/applications/${id}`);
  assert.match(text, /Pay is above your floor; remote in Canada fits\./);
  assert.match(text, /· Agent · from the Posting and your Criteria/);
  assert.match(text, /<h3>The job<\/h3>\n<p>Own billing end to end\.<\/p>/);
  assert.match(text, /I want to build the billing tools I used to fight with\./);

  const listed = (await call(dossier, 'list_applications')).value;
  assert.deepEqual(listed.map((a: { company: string; example?: boolean }) => [a.company, a.example === true]), [
    ['Contoso', false],
    ['Acme', true],
  ]);
});
