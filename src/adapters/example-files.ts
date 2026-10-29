import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ApplicationInput } from '../core/domain.ts';

// The Example: a made-up Candidate's Profile and one Posting, kept as files in example/ so anyone can try Dossier
// before adding their own, and so the tests use the same data.
const dir = join(import.meta.dirname, '..', '..', 'example');
const read = (file: string) => readFileSync(join(dir, file), 'utf8');

export type ExampleDocument = { name: string; text: string };

export function exampleProfile(): ExampleDocument[] {
  const documents = JSON.parse(read('profile.json')) as { name: string; file: string }[];
  return documents.map(({ name, file }) => ({ name, text: read(file).trim() }));
}

export function exampleApplication(): ApplicationInput {
  const { posting, ...application } = JSON.parse(read('application.json'));
  return { ...application, posting: read(posting).trim() };
}
