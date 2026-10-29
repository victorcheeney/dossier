import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addAcme, call, listen, postFromPage, startDossier } from './helpers.ts';

type Highlight = { quote: string; tab: string; note: string; found: boolean };

async function highlight(dossier: Awaited<ReturnType<typeof startDossier>>, applicationId: number, data: Record<string, string>) {
  const response = await postFromPage(dossier, `/applications/${applicationId}/highlights`, data);
  assert.equal(response.status, 201);
  return ((await response.json()) as { id: number }).id;
}

const highlightsOf = async (dossier: Awaited<ReturnType<typeof startDossier>>, id: number): Promise<Highlight[]> =>
  (await call(dossier, 'get_application', { id })).value.highlights;

test('a Highlight made on the page, with its note, reaches the Agent', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);
  const page = await listen(dossier, added.id);

  const id = await highlight(dossier, added.id, { tab: 'posting', quote: 'ship features\n end to end', occurrence: '0' });
  assert.deepEqual(await page.next(), { what: 'highlights' });
  await postFromPage(dossier, `/applications/${added.id}/highlights/${id}/note`, { note: 'I like owning it all.' });

  assert.deepEqual(await highlightsOf(dossier, added.id), [
    { quote: 'ship features end to end', tab: 'posting', note: 'I like owning it all.', found: true },
  ]);
  const { text } = await dossier.page(`/applications/${added.id}`);
  assert.match(text, /data-action="show-highlight">ship features end to end</);
  assert.match(text, /I like owning it all\./);
});

test('a deleted Highlight comes back, note and all, when the Candidate undoes', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);
  const id = await highlight(dossier, added.id, { tab: 'posting', quote: 'small grocers', note: 'My parents ran one.' });

  assert.equal((await postFromPage(dossier, `/applications/${added.id}/highlights/${id}/delete`)).status, 204);
  assert.deepEqual(await highlightsOf(dossier, added.id), []);
  assert.doesNotMatch((await dossier.page(`/applications/${added.id}`)).text, /My parents ran one\./);

  assert.equal((await postFromPage(dossier, `/applications/${added.id}/highlights/${id}/restore`)).status, 204);
  assert.deepEqual(await highlightsOf(dossier, added.id), [
    { quote: 'small grocers', tab: 'posting', note: 'My parents ran one.', found: true },
  ]);
});

test('a Highlight whose text left the Posting stays listed as not found', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);
  await highlight(dossier, added.id, { tab: 'posting', quote: 'small grocers' });

  await call(dossier, 'update_application', { id: added.id, posting: 'Acme builds tools for restaurants.' });

  assert.deepEqual(await highlightsOf(dossier, added.id), [{ quote: 'small grocers', tab: 'posting', note: '', found: false }]);
  const { text } = await dossier.page(`/applications/${added.id}`);
  assert.match(text, /<p class="quote">small grocers<\/p>/);
  assert.match(text, /Not found in the posting/);
});

test('the Agent has no tool to create or delete Highlights', async () => {
  const dossier = await startDossier();
  const { tools } = await dossier.agent.listTools();
  assert.ok(!tools.some((tool) => /highlight/.test(tool.name)));
});

test('an empty Highlight, or one from an unknown tab, is refused', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);

  assert.equal((await postFromPage(dossier, `/applications/${added.id}/highlights`, { tab: 'posting', quote: '  ' })).status, 400);
  assert.equal((await postFromPage(dossier, `/applications/${added.id}/highlights`, { tab: 'email', quote: 'x' })).status, 400);
  assert.deepEqual(await highlightsOf(dossier, added.id), []);
});

test('Highlight text is data on the page, never markup', async () => {
  const dossier = await startDossier();
  const added = await call(dossier, 'add_application', {
    company: 'Acme', role: 'Engineer', link: 'https://example.com', posting: 'Say </script><b>hi</b> now',
  });
  await highlight(dossier, added.value.id, { tab: 'posting', quote: '</script><b>hi</b>', note: '<i>why</i>' });

  const { text } = await dossier.page(`/applications/${added.value.id}`);
  assert.doesNotMatch(text, /<b>hi|<i>why/);
  assert.match(text, /"quote":"\\u003c\/script>\\u003cb>hi\\u003c\/b>"/);
});
