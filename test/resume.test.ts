import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addAcme, call, listen, startDossier } from './helpers.ts';

const base = '<h1>Ada Lovelace</h1>\n<p>Product Engineer</p>\n<h2>Experience</h2>\n<h3>Engineer <span>· Analytical Engines</span> <small>1842 – now</small></h3>\n<ul><li>Wrote the first program.</li></ul>';

test("a new Application's Résumé starts as a copy of the Base résumé", async () => {
  const dossier = await startDossier();
  await call(dossier, 'set_profile_document', { name: 'Base résumé', text: base });

  const added = await addAcme(dossier);
  assert.equal(added.resume, base);
  assert.equal((await call(dossier, 'get_application', { id: added.id })).value.resume, base);

  await call(dossier, 'set_profile_document', { name: 'Base résumé', text: '<h1>Someone else</h1>' });
  assert.equal((await call(dossier, 'get_application', { id: added.id })).value.resume, base, 'later Base résumé changes stay out');

  const { text } = await dossier.page(`/applications/${added.id}`);
  assert.match(text, new RegExp(`<iframe src="/applications/${added.id}/resume\\?embed&amp;v=\\w+" title="Résumé"`));
  assert.match(text, new RegExp(`<a href="/applications/${added.id}/resume\\?print" target="_blank" class="button">Download PDF</a>`));
});

test('without a Base résumé, the Résumé starts empty and the column says what will go there', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);

  assert.equal(added.resume, '');
  const { text } = await dossier.page(`/applications/${added.id}`);
  assert.match(text, /Your Agent will tailor the Résumé here/);
  assert.doesNotMatch(text, /<iframe/);
});

test('set_resume replaces the Résumé, reaches the open page, and the Résumé page shows it in the template', async () => {
  const dossier = await startDossier();
  await call(dossier, 'set_profile_document', { name: 'Base résumé', text: base });
  const added = await addAcme(dossier);
  const page = await listen(dossier, added.id);

  const tailored = '<h1>Ada Lovelace</h1><p>Product Engineer for grocers</p><h2>Experience</h2><ul><li>Shipped <strong>pricing</strong> for <a href="https://acme.example">Acme</a>.</li></ul>';
  const result = await call(dossier, 'set_resume', { id: added.id, html: tailored });
  assert.equal(result.isError, false, result.text);
  assert.equal(result.value.warning, undefined);
  assert.deepEqual(await page.next(), { what: 'resume' });

  assert.equal((await call(dossier, 'get_application', { id: added.id })).value.resume, tailored);
  const resume = await dossier.page(`/applications/${added.id}/resume`);
  assert.equal(resume.status, 200);
  assert.match(resume.text, /<title>Ada Lovelace - Résumé - Acme<\/title>/);
  assert.match(resume.text, /<link rel="stylesheet" href="\/resume.css">/);
  assert.match(resume.text, /<article class="paper"><h1>Ada Lovelace<\/h1><p>Product Engineer for grocers<\/p>/);
  assert.match(resume.text, /<li>Shipped <strong>pricing<\/strong> for <a href="https:\/\/acme.example">Acme<\/a>\.<\/li>/);
});

test('set_resume strips scripts, styles, event handlers and javascript links', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);

  await call(dossier, 'set_resume', {
    id: added.id,
    html: '<h1 onclick="alert(1)" style="color:red">Ada</h1><script>alert(2)</script><style>h1{color:red}</style>'
      + '<p>Safe <a href="javascript:alert(3)">link</a> <a href=\'mailto:ada@example.com\' onmouseover="x()">mail</a></p>'
      + '<img src=x onerror=alert(4)><iframe src="https://evil.example"></iframe><p class="x">1 < 2 & 3</p>',
  });

  const { value } = await call(dossier, 'get_application', { id: added.id });
  assert.equal(
    value.resume,
    '<h1>Ada</h1><p>Safe <a>link</a> <a href="mailto:ada@example.com">mail</a></p><p>1 &lt; 2 &amp; 3</p>',
  );
  const resume = await dossier.page(`/applications/${added.id}/resume`);
  assert.doesNotMatch(resume.text, /alert|onclick|onerror|javascript:|evil\.example|color:red/);
});

test('set_resume warns the Agent when the Résumé probably runs onto a second page', async () => {
  const dossier = await startDossier();
  const added = await addAcme(dossier);
  const bullet = '<li>Built and shipped a pricing service for small grocers, measured its effect on margins, and wrote up what we learned for the team.</li>';
  const role = (n: number) => `<h3>Engineer ${n} <small>2020 – 2021</small></h3><ul>${bullet.repeat(5)}</ul>`;
  const long = `<h1>Ada Lovelace</h1><p>Product Engineer</p><h2>Experience</h2>${[1, 2, 3, 4, 5, 6, 7, 8].map(role).join('')}`;

  const result = await call(dossier, 'set_resume', { id: added.id, html: long });
  assert.equal(result.isError, false, result.text);
  assert.match(result.value.warning, /probably runs onto a second page/);
});
