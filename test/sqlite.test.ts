import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createCore } from '../src/core/index.ts';
import { openSqliteStore } from '../src/adapters/sqlite.ts';
import { exampleApplication } from '../src/adapters/example-files.ts';

test('SQLite commits before notifying and saved data survives reopening', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dossier-store-'));
  const path = join(dir, 'dossier.db');
  const writer = openSqliteStore(path);
  const reader = openSqliteStore(path);
  t.after(() => { writer.close(); reader.close(); rmSync(dir, { recursive: true }); });
  const formReader = { async read() { return { site: 'test', fields: [] }; } };
  const core = createCore({ store: writer, formReader });
  const observed = createCore({ store: reader, formReader });
  const id = core.applications.add(exampleApplication());
  const roles: string[] = [];
  core.applications.subscribe(id, () => roles.push(observed.applications.get(id).role));
  core.applications.update(id, { role: 'Senior Engineer' });
  assert.deepEqual(roles, ['Senior Engineer']);
  const documents: string[][] = [];
  core.profile.subscribe(() => documents.push(observed.profile.list().map((d) => `${d.name}: ${d.text}`)));
  const voice = core.profile.set('Voice', 'Plain.');
  core.profile.update(voice, { name: 'My voice', text: 'Short.' });
  assert.deepEqual(documents, [['Voice: Plain.'], ['My voice: Short.']]);
  const reopened = openSqliteStore(path);
  try {
    const saved = createCore({ store: reopened, formReader });
    assert.equal(saved.applications.get(id).role, 'Senior Engineer');
    assert.equal(saved.profile.get('My voice').text, 'Short.');
  } finally { reopened.close(); }
});
