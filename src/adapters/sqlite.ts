import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ApplicationInput, ApplicationRow, Change, ClosedReason, FieldInput, FieldKind, Highlight, HighlightInput, Listener, Note, NoteInput, ProfileDocument, Stage } from '../core/domain.ts';
import type { NewApplication, NewDocument, StoredApplication, Store } from '../core/ports.ts';

const schema = `
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    link TEXT NOT NULL,
    posting TEXT NOT NULL,
    pay TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    stage TEXT NOT NULL DEFAULT 'Preparing',
    closed_reason TEXT,
    summary TEXT NOT NULL DEFAULT '',
    research TEXT NOT NULL DEFAULT '',
    resume TEXT NOT NULL DEFAULT '',
    example INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
  CREATE TABLE IF NOT EXISTS fields (
    id INTEGER PRIMARY KEY,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    label TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('short_text', 'long_text', 'file', 'choice')),
    options TEXT NOT NULL DEFAULT '[]',
    required INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS highlights (
    id INTEGER PRIMARY KEY,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    tab TEXT NOT NULL CHECK (tab IN ('posting', 'research')),
    quote TEXT NOT NULL,
    occurrence INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    author TEXT NOT NULL CHECK (author IN ('Candidate', 'Agent')),
    source TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
  CREATE TABLE IF NOT EXISTS profile_documents (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    text TEXT NOT NULL DEFAULT '',
    example INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
  CREATE TABLE IF NOT EXISTS answers (
    field_id INTEGER PRIMARY KEY REFERENCES fields(id) ON DELETE CASCADE,
    text TEXT NOT NULL DEFAULT ''
  );
`;

const rowColumns = `id, company, role, link, pay, location, stage, closed_reason AS closedReason, created_at AS createdAt, example`;

type SqlExample<T> = Omit<T, 'example'> & { example: number };

const withExample = <T extends { example: number }>({ example, ...row }: T) => ({ ...row, example: example === 1 });

export function openSqliteStore(path: string): Store & { close(): void } {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(schema);
  // Databases made before the Example shipped gain its flag.
  for (const table of ['applications', 'profile_documents']) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((column) => column.name === 'example')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN example INTEGER NOT NULL DEFAULT 0`);
    }
  }

  function transaction<T>(work: () => T): T {
    db.exec('BEGIN');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  // Replaces the Field list. A Field keeping its label keeps its id and its Answer.
  function replaceFields(applicationId: number, fields: FieldInput[]) {
    const existing = new Map(
      (db.prepare('SELECT id, label FROM fields WHERE application_id = ?').all(applicationId) as { id: number; label: string }[]).map(
        ({ id, label }) => [label, id],
      ),
    );
    const update = db.prepare('UPDATE fields SET position = ?, kind = ?, options = ?, required = ? WHERE id = ?');
    const insertField = db.prepare(
      'INSERT INTO fields (application_id, position, label, kind, options, required) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const insertAnswer = db.prepare("INSERT INTO answers (field_id, text) VALUES (?, '')");
    fields.forEach((field, position) => {
      const options = JSON.stringify(field.options ?? []);
      const required = field.required ? 1 : 0;
      const id = existing.get(field.label);
      if (id === undefined) {
        const { lastInsertRowid } = insertField.run(applicationId, position, field.label, field.kind, options, required);
        insertAnswer.run(lastInsertRowid);
      } else {
        update.run(position, field.kind, options, required, id);
        existing.delete(field.label);
      }
    });
    const remove = db.prepare('DELETE FROM fields WHERE id = ?');
    for (const id of existing.values()) remove.run(id);
  }

  const listeners = new Map<number, Set<Listener>>();
  function changed(applicationId: number, change: Change) {
    for (const listener of listeners.get(applicationId) ?? []) listener(change);
  }
  const profileListeners = new Set<Listener>();
  function profileChanged() {
    for (const listener of profileListeners) listener({ what: 'profile' });
  }
  const profileColumns = 'id, name, text, updated_at AS updatedAt, example';
  function getProfileDocument(id: number): ProfileDocument | null {
    const row = db.prepare(`SELECT ${profileColumns} FROM profile_documents WHERE id = ?`).get(id) as
      | SqlExample<ProfileDocument> | undefined;
    return row ? withExample(row) : null;
  }
  const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

  function insertApplication(input: NewApplication) {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO applications (company, role, link, posting, pay, location, resume, example) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(input.company, input.role, input.link, input.posting, input.pay ?? '', input.location ?? '', input.resume, input.example ? 1 : 0);
    const id = Number(lastInsertRowid);
    replaceFields(id, input.fields ?? []);
    return id;
  }

  return {
    addApplication(input: NewApplication): number {
      return transaction(() => insertApplication(input));
    },

    hasExample(): boolean {
      return (
        db.prepare('SELECT 1 FROM applications WHERE example = 1 UNION ALL SELECT 1 FROM profile_documents WHERE example = 1').get() !==
        undefined
      );
    },

    addExample(profile: NewDocument[], application: NewApplication): number {
      const id = transaction(() => {
        const insert = db.prepare(`INSERT INTO profile_documents (name, text, example, updated_at) VALUES (?, ?, 1, ${now})`);
        for (const document of profile) insert.run(document.name, document.text);
        return insertApplication(application);
      });
      profileChanged();
      return id;
    },

    // Deletes exactly what loading the Example made, and nothing the Candidate made.
    removeExample() {
      const ids = (db.prepare('SELECT id FROM applications WHERE example = 1').all() as { id: number }[]).map((row) => row.id);
      transaction(() => {
        db.prepare('DELETE FROM applications WHERE example = 1').run();
        db.prepare('DELETE FROM profile_documents WHERE example = 1').run();
      });
      for (const id of ids) changed(id, { what: 'deleted' });
      profileChanged();
    },

    updateApplication(id: number, changes: Partial<ApplicationInput>) {
      transaction(() => {
        const columns = (['company', 'role', 'link', 'posting', 'pay', 'location'] as const).filter(
          (column) => changes[column] !== undefined,
        );
        if (columns.length > 0) {
          db.prepare(`UPDATE applications SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(
            ...columns.map((c) => changes[c] as string),
            id,
          );
        }
        if (changes.fields) replaceFields(id, changes.fields);
      });
      changed(id, { what: 'application' });
    },

    setAnswer(applicationId: number, fieldId: number, text: string) {
      db.prepare('UPDATE answers SET text = ? WHERE field_id = ?').run(text, fieldId);
      changed(applicationId, { what: 'answer', fieldId });
    },

    listApplications(stage?: Stage): ApplicationRow[] {
      const rows = stage
        ? db.prepare(`SELECT ${rowColumns} FROM applications WHERE stage = ? ORDER BY created_at DESC, id DESC`).all(stage)
        : db.prepare(`SELECT ${rowColumns} FROM applications ORDER BY created_at DESC, id DESC`).all();
      return (rows as SqlExample<ApplicationRow>[]).map(withExample);
    },

    getApplication(id: number): StoredApplication | null {
      const row = db.prepare(`SELECT ${rowColumns}, posting, summary, research, resume FROM applications WHERE id = ?`).get(id) as
        | SqlExample<ApplicationRow & { posting: string; summary: string; research: string; resume: string }>
        | undefined;
      if (!row) return null;
      const fields = (
        db
          .prepare(
            `SELECT f.id, f.label, f.kind, f.options, f.required, a.text AS answer
             FROM fields f JOIN answers a ON a.field_id = f.id
             WHERE f.application_id = ? ORDER BY f.position`,
          )
          .all(id) as { id: number; label: string; kind: FieldKind; options: string; required: number; answer: string }[]
      ).map((field) => ({ ...field, options: JSON.parse(field.options) as string[], required: field.required === 1 }));
      const highlights = (
        db
          .prepare('SELECT id, tab, quote, occurrence, note FROM highlights WHERE application_id = ? AND deleted = 0 ORDER BY id')
          .all(id) as Omit<Highlight, 'found'>[]
      );
      const notes = db
        .prepare(
          'SELECT id, author, source, text, created_at AS createdAt FROM notes WHERE application_id = ? ORDER BY created_at DESC, id DESC',
        )
        .all(id) as Note[];
      return { ...withExample(row), fields, highlights, notes };
    },

    setStage(id: number, stage: Stage, reason: ClosedReason | null) {
      db.prepare('UPDATE applications SET stage = ?, closed_reason = ? WHERE id = ?').run(
        stage,
        reason,
        id,
      );
      changed(id, { what: 'stage' });
    },

    deleteApplication(id: number) {
      db.prepare('DELETE FROM applications WHERE id = ?').run(id);
      changed(id, { what: 'deleted' });
    },

    setSummary(id: number, summary: string) {
      db.prepare('UPDATE applications SET summary = ? WHERE id = ?').run(summary, id);
      changed(id, { what: 'summary' });
    },

    setResearch(id: number, research: string) {
      db.prepare('UPDATE applications SET research = ? WHERE id = ?').run(research, id);
      changed(id, { what: 'research' });
    },

    setResume(id: number, resume: string) {
      db.prepare('UPDATE applications SET resume = ? WHERE id = ?').run(resume, id);
      changed(id, { what: 'resume' });
    },

    addNote(applicationId: number, note: NoteInput): number {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO notes (application_id, author, source, text) VALUES (?, ?, ?, ?)')
        .run(applicationId, note.author, note.source, note.text);
      changed(applicationId, { what: 'notes' });
      return Number(lastInsertRowid);
    },

    editNote(applicationId: number, noteId: number, text: string) {
      db.prepare('UPDATE notes SET text = ? WHERE id = ?').run(text, noteId);
      changed(applicationId, { what: 'notes' });
    },

    deleteNote(applicationId: number, noteId: number) {
      db.prepare('DELETE FROM notes WHERE id = ?').run(noteId);
      changed(applicationId, { what: 'notes' });
    },

    addHighlight(applicationId: number, input: HighlightInput): number {
      const { lastInsertRowid } = db
        .prepare('INSERT INTO highlights (application_id, tab, quote, occurrence, note) VALUES (?, ?, ?, ?, ?)')
        .run(applicationId, input.tab, input.quote, input.occurrence, input.note);
      changed(applicationId, { what: 'highlights' });
      return Number(lastInsertRowid);
    },

    hasHighlight(applicationId: number, highlightId: number) {
      return db.prepare('SELECT 1 FROM highlights WHERE id = ? AND application_id = ?').get(highlightId, applicationId) !== undefined;
    },

    setHighlightNote(applicationId: number, highlightId: number, note: string) {
      db.prepare('UPDATE highlights SET note = ? WHERE id = ?').run(note, highlightId);
      changed(applicationId, { what: 'highlights' });
    },

    // Deleting keeps the row, so undo can bring the same Highlight back.
    setHighlightDeleted(applicationId: number, highlightId: number, deleted: boolean) {
      db.prepare('UPDATE highlights SET deleted = ? WHERE id = ?').run(deleted ? 1 : 0, highlightId);
      changed(applicationId, { what: 'highlights' });
    },

    listProfileDocuments(): ProfileDocument[] {
      return (db.prepare(`SELECT ${profileColumns} FROM profile_documents ORDER BY id`).all() as SqlExample<ProfileDocument>[]).map(
        withExample,
      );
    },

    getProfileDocument,

    addProfileDocument({ name, text }: NewDocument): number {
      const { lastInsertRowid } = db.prepare(`INSERT INTO profile_documents (name, text, updated_at) VALUES (?, ?, ${now})`).run(name, text);
      profileChanged();
      return Number(lastInsertRowid);
    },

    updateProfileDocument(id: number, changes: Partial<NewDocument>) {
      transaction(() => {
        if (changes.name !== undefined) db.prepare(`UPDATE profile_documents SET name = ?, updated_at = ${now} WHERE id = ?`).run(changes.name, id);
        if (changes.text !== undefined) db.prepare(`UPDATE profile_documents SET text = ?, updated_at = ${now} WHERE id = ?`).run(changes.text, id);
      });
      profileChanged();
    },

    deleteProfileDocument(id: number) {
      db.prepare('DELETE FROM profile_documents WHERE id = ?').run(id);
      profileChanged();
    },

    subscribeProfile(listener: Listener) {
      profileListeners.add(listener);
      return () => profileListeners.delete(listener);
    },

    // Calls the listener after every change to one Application, whether the Agent or the page made it.
    subscribe(applicationId: number, listener: Listener) {
      const set = listeners.get(applicationId) ?? new Set();
      listeners.set(applicationId, set.add(listener));
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(applicationId);
      };
    },

    close() {
      db.close();
    },
  };
}
