import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createCore } from '../src/core/index.ts';
import { NameTaken, NotFound, Refusal, type Stage, type ClosedReason, type HighlightTab, type FieldKind } from '../src/core/domain.ts';
import { openSqliteStore } from '../src/adapters/sqlite.ts';
import { exampleApplication, exampleProfile } from '../src/adapters/example-files.ts';

function setup(t: TestContext) {
  const store = openSqliteStore(':memory:');
  t.after(() => store.close());
  const core = createCore({ store, formReader: { async read() { throw new Refusal('Unsupported form.'); } } });
  const id = core.applications.add(exampleApplication());
  return { ...core, id };
}

test('required Posting details and valid Fields are checked before any write', (t) => {
  const { applications, id } = setup(t);
  for (const key of ['company', 'role', 'link', 'posting']) {
    assert.throws(() => applications.add({ ...exampleApplication(), [key]: '  ' }), Refusal);
    assert.throws(() => applications.update(id, { [key]: '' }), Refusal);
  }
  for (const field of [
    { label: '', kind: 'short_text' as FieldKind },
    { label: 'Location', kind: 'invalid' as FieldKind },
    { label: 'Location', kind: 'choice' as FieldKind, options: [] },
  ]) assert.throws(() => applications.update(id, { company: 'Changed', fields: [field] }), Refusal);
  assert.equal(applications.list().length, 1);
  assert.equal(applications.get(id).company, 'Acme');
});

test('Answers accept an exact label or id, validate choices and refuse file Fields', (t) => {
  const { applications, id } = setup(t);
  const other = applications.add(exampleApplication());
  const fields = applications.get(id).fields;
  const choice = fields.find((f) => f.kind === 'choice')!;
  applications.setAnswer(id, choice.label, 'Yes');
  assert.throws(() => applications.setAnswer(id, choice.id, 'Maybe'), Refusal);
  assert.throws(() => applications.setAnswer(id, 'Résumé', 'resume.pdf'), Refusal);
  assert.throws(() => applications.setAnswer(id, 'are you in canada?', 'Yes'), NotFound);
  assert.throws(() => applications.setAnswer(other, choice.id, 'No'), NotFound);
  assert.equal(applications.get(id).fields.find((f) => f.id === choice.id)!.answer, 'Yes');
  applications.setAnswer(id, choice.id, '');
  assert.equal(applications.get(id).fields.find((f) => f.id === choice.id)!.answer, '');
});

test('replacing Fields preserves Answers by label and removes omitted Fields', (t) => {
  const { applications, id } = setup(t);
  const field = applications.setAnswer(id, 'Why Acme?', 'Grocers.');
  applications.update(id, { fields: [{ label: 'Why Acme?', kind: 'long_text' }, { label: 'New question', kind: 'short_text' }] });
  assert.deepEqual(applications.get(id).fields.map((f) => [f.label, f.answer]), [['Why Acme?', 'Grocers.'], ['New question', '']]);
  assert.equal(applications.get(id).fields[0].id, field.id);
});

test('Closed requires a valid reason, other Stages reject one, reopening clears it', (t) => {
  const { applications, id } = setup(t);
  assert.throws(() => applications.setStage(id, 'Closed'), Refusal);
  assert.throws(() => applications.setStage(id, 'Closed', 'invalid' as ClosedReason), Refusal);
  assert.throws(() => applications.setStage(id, 'Applied', 'accepted'), Refusal);
  assert.throws(() => applications.setStage(id, 'Unknown' as Stage), Refusal);
  assert.throws(() => applications.list('Unknown' as Stage), Refusal);
  assert.equal(applications.get(id).stage, 'Preparing');
  for (const reason of ['rejected', 'withdrew', 'accepted'] as const) {
    applications.setStage(id, 'Closed', reason);
    assert.equal(applications.get(id).closedReason, reason);
  }
  applications.setStage(id, 'Interviewing');
  assert.equal(applications.get(id).closedReason, null);
  assert.deepEqual(applications.list('Interviewing').map((a) => a.id), [id]);
});

test('Notes trim text and source and refuse empty creation or edits without changing saved text', (t) => {
  const { applications, id } = setup(t);
  for (const author of ['Agent', 'Candidate'] as const) {
    assert.throws(() => applications.addNote(id, { author, text: ' \n ', source: 'email' }), Refusal);
    assert.deepEqual(applications.get(id).notes.filter((n) => n.author === author), []);
    const noteId = applications.addNote(id, { author, text: ' Interview invited. \n', source: ' email ' });
    const note = applications.get(id).notes.find((n) => n.id === noteId)!;
    assert.equal(note.text, 'Interview invited.');
    assert.equal(note.source, 'email');
    assert.throws(() => applications.editNote(id, noteId, '\t'), Refusal);
    assert.equal(applications.get(id).notes.find((n) => n.id === noteId)!.text, 'Interview invited.');
    applications.editNote(id, noteId, ' Accepted. ');
    assert.equal(applications.get(id).notes.find((n) => n.id === noteId)!.text, 'Accepted.');
  }
});

test('Notes and Highlights belong to their Application, including deleted Highlights', (t) => {
  const { applications, id } = setup(t);
  const other = applications.add(exampleApplication());
  const note = applications.addNote(id, { author: 'Candidate', text: 'Interesting.', source: '' });
  const highlight = applications.addHighlight(id, { tab: 'posting', quote: 'Acme', occurrence: 0, note: 'Product' });
  for (const operation of [
    () => applications.editNote(other, note, 'Changed'),
    () => applications.deleteNote(other, note),
    () => applications.setHighlightNote(other, highlight, 'Changed'),
    () => applications.setHighlightDeleted(other, highlight, true),
  ]) assert.throws(operation, NotFound);
  applications.setHighlightDeleted(id, highlight, true);
  assert.deepEqual(applications.get(id).highlights, []);
  applications.setHighlightDeleted(id, highlight, false);
  assert.equal(applications.get(id).highlights[0].note, 'Product');
  applications.deleteNote(id, note);
  assert.deepEqual(applications.get(id).notes, []);
});

test('Highlights require matching text, a known tab and a nonnegative whole occurrence', (t) => {
  const { applications, id } = setup(t);
  const valid = { tab: 'posting' as HighlightTab, quote: 'Acme', occurrence: 0, note: '' };
  for (const input of [
    { ...valid, quote: '  ' }, { ...valid, quote: 'missing quote' },
    { ...valid, tab: 'summary' as HighlightTab }, { ...valid, occurrence: -1 }, { ...valid, occurrence: 0.5 },
  ]) assert.throws(() => applications.addHighlight(id, input), Refusal);
  applications.setResearch(id, '## Work\n\nA **small** [team](https://example.com).');
  applications.addHighlight(id, { ...valid, tab: 'research', quote: ' A small\n team. ' });
  assert.equal(applications.get(id).highlights[0].quote, 'A small team.');
  assert.equal(applications.get(id).highlights[0].found, true);
  applications.setResearch(id, 'Changed.');
  assert.equal(applications.get(id).highlights[0].found, false);
});

test('Profile names use the same case, whitespace and Unicode matching for every operation', (t) => {
  const { profile, applications } = setup(t);
  const id = profile.set(' Base résumé ', '<h1>Alex</h1>');
  assert.equal(profile.set('BASE RE\u0301SUME\u0301', '<h1>Alex Martin</h1>'), id);
  assert.equal(profile.find('base résumé')!.id, id);
  assert.equal(profile.read(['BASE RE\u0301SUME\u0301']).documents[0].id, id);
  assert.equal(profile.open(' BASE RÉSUMÉ '), id);
  assert.equal(profile.list().length, 1);
  const application = applications.add(exampleApplication());
  assert.equal(applications.get(application).resume, '<h1>Alex Martin</h1>');
  profile.delete('BASE RE\u0301SUME\u0301');
  assert.deepEqual(profile.list(), []);
});

test('Profile documents need names and renames cannot replace another document', (t) => {
  const { profile } = setup(t);
  assert.throws(() => profile.set(' ', 'text'), Refusal);
  const voice = profile.set('Voice', 'Plain.');
  const criteria = profile.set('Criteria', 'Remote.');
  assert.throws(() => profile.update(voice, { name: '' }), Refusal);
  assert.throws(() => profile.update(voice, { name: ' criteria ', text: 'Changed.' }), NameTaken);
  assert.equal(profile.get(voice).text, 'Plain.');
  assert.equal(profile.get(criteria).text, 'Remote.');
  assert.equal(profile.get(profile.open('')).name, 'Untitled');
  assert.equal(profile.get(profile.open('')).name, 'Untitled 2');
});

test('editing a Profile passage requires one exact match and permits deleting that passage', (t) => {
  const { profile } = setup(t);
  const id = profile.set('Stories', 'One story. Another story.');
  for (const passage of ['', 'missing', 'story']) assert.throws(() => profile.edit(id, passage, 'Changed'), Refusal);
  assert.equal(profile.get(id).text, 'One story. Another story.');
  profile.edit(id, 'Another story.', '');
  assert.equal(profile.get(id).text, 'One story. ');
});

test('a Résumé is sanitized on copying and replacing; later Profile edits leave the copy alone', (t) => {
  const { profile, applications } = setup(t);
  profile.set('Base résumé', '<h1 onclick="bad()">Alex</h1><script>bad()</script><style>bad</style>');
  const id = applications.add(exampleApplication());
  assert.equal(applications.get(id).resume, '<h1>Alex</h1>');
  profile.set('Base résumé', '<h1>Changed</h1>');
  assert.equal(applications.get(id).resume, '<h1>Alex</h1>');
  applications.setResume(id, '<p>Engineer</p><a href="javascript:bad()">link</a>');
  assert.equal(applications.get(id).resume, '<p>Engineer</p><a>link</a>');
  const long = '<p>' + 'Experience '.repeat(1500) + '</p>';
  assert.ok(applications.setResume(id, long).warning);
  assert.equal(applications.get(id).resume, long);
});

test('missing Applications refuse reads and writes without changing an existing Application', (t) => {
  const { applications, profile, id } = setup(t);
  for (const operation of [
    () => applications.get(999), () => applications.update(999, { role: 'Changed' }),
    () => applications.delete(999), () => applications.setStage(999, 'Applied'),
    () => applications.setSummary(999, 'Changed'), () => applications.setResearch(999, 'Changed'),
    () => applications.setResume(999, '<p>Changed</p>'), () => applications.setAnswer(999, 'Full name', 'Changed'),
    () => applications.addNote(999, { author: 'Agent', source: '', text: 'Changed' }),
    () => applications.subscribe(999, () => {}), () => profile.get(999),
    () => profile.update(999, { text: 'Changed' }), () => profile.delete(999),
  ]) assert.throws(operation, NotFound);
  assert.equal(applications.get(id).summary, '');
  assert.equal(applications.list().length, 1);
});

test('subscribers read saved changes, receive no refused writes and can unsubscribe', (t) => {
  const { applications, profile, id } = setup(t);
  const notes: string[][] = [];
  const stop = applications.subscribe(id, () => notes.push(applications.get(id).notes.map((n) => n.text)));
  assert.throws(() => applications.addNote(id, { author: 'Agent', source: '', text: '' }), Refusal);
  applications.addNote(id, { author: 'Agent', source: '', text: 'Saved' });
  stop();
  applications.addNote(id, { author: 'Agent', source: '', text: 'Later' });
  assert.deepEqual(notes, [['Saved']]);
  const documents: string[][] = [];
  const stopProfile = profile.subscribe(() => documents.push(profile.list().map((d) => d.text)));
  profile.set('Voice', 'Plain.');
  stopProfile();
  profile.set('Voice', 'Short.');
  assert.deepEqual(documents, [['Plain.']]);
});

test('Example loading is idempotent, skips existing names and uses its own Base résumé', (t) => {
  const { applications, profile, example, id } = setup(t);
  profile.set('BASE RÉSUMÉ', '<h1>Candidate</h1>');
  const documents = exampleProfile();
  const exampleId = example.load(documents, exampleApplication())!;
  example.load(documents, exampleApplication());
  assert.equal(applications.list().length, 2);
  assert.match(applications.get(exampleId).resume, /Alex Martin/);
  assert.equal(profile.get('Base résumé').text, '<h1>Candidate</h1>');
  example.remove();
  assert.equal(example.has(), false);
  assert.deepEqual(applications.list().map((a) => a.id), [id]);
  assert.equal(profile.list().length, 1);
});
