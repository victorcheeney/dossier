import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addAcme, call, listen, postFromPage, startDossier } from './helpers.ts';

test("the Agent's Summary renders as Markdown in the Summary tab", async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);
  const page = await listen(dossier, added.id);

  const result = await call(dossier, 'set_summary', {
    id: added.id,
    summary: '## The job\nOwn **pricing** end to end.\n\n## Watch out\n- On-call\n- [Reviews](https://example.com/reviews)',
  });
  assert.equal(result.isError, false, result.text);
  assert.deepEqual(await page.next(), { what: 'summary' });

  const { text } = await dossier.page(`/applications/${added.id}`);
  assert.match(text, /<h3>The job<\/h3>\n<p>Own <strong>pricing<\/strong> end to end\.<\/p>/);
  assert.match(text, /<li><a href="https:\/\/example\.com\/reviews" target="_blank" rel="noreferrer">Reviews<\/a><\/li>/);
  assert.equal((await call(dossier, 'get_application', { id: added.id })).value.summary.startsWith('## The job'), true);
});

test('Markdown from the Agent cannot run script or link to javascript:', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);

  await call(dossier, 'set_research', {
    id: added.id,
    research: '# Acme\n<script>alert(1)</script>\n\n[click](javascript:alert(1)) <img src=x onerror=alert(1)>',
  });

  const { text } = await dossier.page(`/applications/${added.id}`);
  assert.doesNotMatch(text, /<script>alert|<img|href="javascript/);
  assert.match(text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(text, /\[click\]\(javascript:alert\(1\)\)/);
});

test('empty Summary and Research tabs say what the Agent will put there', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);
  const { text } = await dossier.page(`/applications/${added.id}`);

  assert.match(text, /Your Agent will put its Summary of the Posting here/);
  assert.match(text, /Your Agent will put what it finds about Acme here/);
});

test("the Agent's Note shows in the Notes tab with its date, author and source", async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);

  const result = await call(dossier, 'add_note', {
    id: added.id,
    text: 'Pay is above your floor.',
    source: 'the Posting and your Criteria',
  });
  assert.equal(result.isError, false, result.text);

  const { text } = await dossier.page(`/applications/${added.id}`);
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  assert.match(text, new RegExp(`<strong>${today}</strong> · Agent · from the Posting and your Criteria`));
  assert.match(text, /<p class="note-text">Pay is above your floor\.<\/p>/);
});

test("the Candidate's Notes reach the Agent, newest first, and can be edited and deleted", async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);
  await call(dossier, 'add_note', { id: added.id, text: 'Posting read.', source: 'the Posting' });

  const response = await postFromPage(dossier, `/applications/${added.id}/notes`, { text: 'Recruiter called.' });
  assert.equal(response.status, 201);
  const { id } = (await response.json()) as { id: number };

  const notes = async () =>
    (await call(dossier, 'get_application', { id: added.id })).value.notes.map((n: { author: string; text: string }) => [n.author, n.text]);
  assert.deepEqual(await notes(), [
    ['Candidate', 'Recruiter called.'],
    ['Agent', 'Posting read.'],
  ]);

  await postFromPage(dossier, `/applications/${added.id}/notes/${id}`, { text: 'Recruiter called; call back Friday.' });
  assert.deepEqual((await notes())[0], ['Candidate', 'Recruiter called; call back Friday.']);

  await postFromPage(dossier, `/applications/${added.id}/notes/${id}/delete`);
  assert.deepEqual(await notes(), [['Agent', 'Posting read.']]);
});

test('the Candidate highlights Research text, and the Agent reads it', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);
  await call(dossier, 'set_research', { id: added.id, research: '## Reviews\n- Engineers say the **pace is calm**.' });

  const created = await postFromPage(dossier, `/applications/${added.id}/highlights`, { tab: 'research', quote: 'the pace is calm' });
  assert.equal(created.status, 201);
  const missing = await postFromPage(dossier, `/applications/${added.id}/highlights`, { tab: 'research', quote: 'free lunch' });
  assert.equal(missing.status, 400);

  const { value } = await call(dossier, 'get_application', { id: added.id });
  assert.deepEqual(value.highlights, [{ quote: 'the pace is calm', tab: 'research', note: '', found: true }]);
});
