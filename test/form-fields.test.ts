import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { call, startDossier } from './helpers.ts';

// Saved public responses (Oct 28, 2026), served in place of each site's real endpoint.
const fixtures: Record<string, string> = {
  'https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting': 'ashby-posthog-product-engineer.json',
  'https://boards-api.greenhouse.io/v1/boards/discord/jobs/8659978002?questions=true': 'greenhouse-discord-full-stack-engineer.json',
  'https://jobs.lever.co/spotify/186b763a-2a61-4563-8813-ff6b40c9c8a7/apply': 'lever-spotify-backend-engineer.html',
};

const savedResponses: typeof fetch = async (input) => {
  const file = fixtures[String(input)];
  if (!file) return new Response('Not found', { status: 404 });
  return new Response(readFileSync(join(import.meta.dirname, 'fixtures', file), 'utf8'));
};

type Field = { label: string; kind: string; options: string[]; required: boolean };
const shapes = (fields: Field[]) => fields.map((f) => [f.label, f.kind, f.options, f.required]);

async function readForm(link: string, fetch: typeof globalThis.fetch = savedResponses) {
  const dossier = await startDossier({ fetch });
  return { dossier, result: await call(dossier, 'read_form_fields', { link }) };
}

test('read_form_fields reads every Field of an Ashby form, and add_application takes them as they are', async () => {
  const { dossier, result } = await readForm('https://jobs.ashbyhq.com/posthog/20ab9628-20ff-4ae3-bd6a-46ae7e9dc6b8');
  assert.equal(result.isError, false, result.text);
  assert.equal(result.value.role, 'Product Engineer');
  assert.deepEqual(shapes(result.value.fields), [
    ['Name', 'short_text', [], true],
    ['Email', 'short_text', [], true],
    ['GitHub', 'short_text', [], true],
    ['Cover letter', 'long_text', [], false],
    ['Resume/CV', 'file', [], true],
    ['LinkedIn', 'short_text', [], false],
    ['Portfolio/Personal website', 'short_text', [], false],
    ['How did you hear about us?', 'short_text', [], false],
    ['Have you built anything agents use?', 'short_text', [], true],
    ['Where are you located?', 'short_text', [], true],
    ['Do you require sponsorship to work in your desired location?', 'short_text', [], true],
    ['Your preferred team(s)', 'short_text', [], false],
  ]);

  const added = await call(dossier, 'add_application', {
    company: 'PostHog',
    role: result.value.role,
    link: result.value.link,
    posting: 'The Posting text.',
    fields: result.value.fields,
  });
  assert.equal(added.isError, false, added.text);
  assert.equal(added.value.fields.length, 12);
});

test('read_form_fields reads a Greenhouse form, with its choices, the role and the company', async () => {
  const { result } = await readForm('https://job-boards.greenhouse.io/discord/jobs/8659978002');
  assert.equal(result.isError, false, result.text);
  assert.equal(result.value.company, 'Discord');
  assert.equal(result.value.role, 'Senior Full-Stack Software Engineer, Ads');
  assert.deepEqual(shapes(result.value.fields), [
    ['First Name', 'short_text', [], true],
    ['Last Name', 'short_text', [], true],
    ['Preferred First Name', 'short_text', [], false],
    ['Email', 'short_text', [], true],
    ['Phone', 'short_text', [], true],
    ['Resume/CV', 'file', [], true],
    ['Cover Letter', 'long_text', [], false],
    ['Why do you want to work at Discord?', 'long_text', [], true],
    ['LinkedIn Profile', 'short_text', [], false],
    ['Website', 'short_text', [], false],
    ['How did you hear about this job?', 'short_text', [], false],
    ['Are you legally authorized to work in the United States for our Company?', 'choice', ['Yes', 'No'], true],
    ['Are you currently located in the US?', 'choice', ['Yes', 'No'], true],
    ['Are you currently based in or willing to relocate to the Bay Area for this position?', 'choice', ['Yes', 'No'], true],
    ['Location', 'short_text', [], true],
  ]);
});

test('read_form_fields reads a Lever form once per question, with select, radio and checkbox options', async () => {
  const { result } = await readForm('https://jobs.lever.co/spotify/186b763a-2a61-4563-8813-ff6b40c9c8a7');
  assert.equal(result.isError, false, result.text);
  assert.equal(result.value.company, 'Spotify');
  assert.equal(result.value.role, 'Backend Engineer - Data Platform');
  const fields: Field[] = result.value.fields;
  const byLabel = (label: string) => fields.find((f) => f.label === label);

  assert.equal(fields.length, 18);
  assert.equal(fields.filter((f) => f.label === 'What best describes your gender?').length, 1, 'a repeated question is listed once');
  assert.deepEqual(shapes(fields.slice(1, 8)), [
    ['Resume/CV', 'file', [], true],
    ['Full name', 'short_text', [], true],
    ['Pronouns', 'short_text', ['He/him', 'She/her', 'They/them', 'Xe/xem', 'Ze/hir', 'Ey/em', 'Hir/hir', 'Fae/faer', 'Hu/hu', 'Use name only', 'Custom'], false],
    ['Email', 'short_text', [], true],
    ['Phone', 'short_text', [], true],
    ['Current location', 'short_text', [], true],
    ['Current company', 'short_text', [], true],
  ]);
  assert.match(fields[0].label, /^Are you interested in working out of any of the following office locations\?/);
  assert.deepEqual([fields[0].kind, fields[0].options], ['choice', ['Stockholm', 'London']]);
  assert.deepEqual(byLabel('Are you a veteran/have you served in the military?')?.options, ['Yes', 'No', 'Prefer not to disclose']);
  assert.deepEqual(byLabel('Have you ever been previously employed by Spotify?'), {
    label: 'Have you ever been previously employed by Spotify?',
    kind: 'short_text',
    options: ['No', 'Yes - Intern', 'Yes - Full Time Employment'],
    required: true,
  });
});

const fallback = /Get the Fields another way: open the form with your own browser or fetch tools, or ask the Candidate to paste the form\./;

test('read_form_fields on any other site tells the Agent to get the Fields another way', async () => {
  let fetched = false;
  const { result } = await readForm('https://careers.example.com/jobs/123', async () => {
    fetched = true;
    return new Response('');
  });
  assert.equal(result.isError, true);
  assert.match(result.text, /could not read the Fields from https:\/\/careers\.example\.com\/jobs\/123/);
  assert.match(result.text, fallback);
  assert.equal(fetched, false, 'Dossier fetches nothing from other sites');
});

test('read_form_fields tells the Agent to get the Fields another way when the network fails, the site refuses, or the form is empty', async () => {
  const ashby = 'https://jobs.ashbyhq.com/posthog/20ab9628-20ff-4ae3-bd6a-46ae7e9dc6b8';
  const failures: (typeof fetch)[] = [
    async () => {
      throw new TypeError('fetch failed');
    },
    async () => new Response('Too many requests', { status: 429 }),
    async () => new Response('not json'),
    async () => new Response(JSON.stringify({ data: { jobPosting: { title: 'X', applicationForm: { sections: [] } } } })),
  ];
  for (const failing of failures) {
    const { result } = await readForm(ashby, failing);
    assert.equal(result.isError, true);
    assert.match(result.text, fallback);
  }
});
