import type { FieldInput } from '../core/domain.ts';

// Reads the Fields of a public Lever, Greenhouse or Ashby application form: the one place Dossier fetches
// anything itself (decision 12). Any other site, or any failure, is a FormFieldsError the Agent can act on.

export type Fetch = typeof fetch;
import type { FormFields, FormReader } from '../core/ports.ts';
import { Refusal } from '../core/domain.ts';

class FormFieldsError extends Refusal {}

export function jobBoards(fetchFn: Fetch): FormReader {
  return { read: (link) => readFormFields(link, fetchFn) };
}

async function readFormFields(url: string, fetchFn: Fetch): Promise<FormFields> {
  const read = reader(url);
  if (!read) throw new FormFieldsError('Dossier reads only jobs.lever.co, greenhouse.io/<board>/jobs/<id> and jobs.ashbyhq.com forms.');
  let result: FormFields;
  try {
    result = await read(fetchFn);
  } catch (error) {
    if (error instanceof FormFieldsError) throw error;
    throw new FormFieldsError(`Reading the form failed: ${error instanceof Error ? error.message : String(error)}.`);
  }
  const fields = withoutRepeats(result.fields.filter((field) => field.label !== ''));
  if (fields.length === 0) throw new FormFieldsError('The form has no Fields Dossier can read.');
  return { ...result, fields };
}

function reader(url: string): ((fetchFn: Fetch) => Promise<FormFields>) | null {
  const onLever = url.match(/jobs\.lever\.co\/([^/?#]+)\/([0-9a-f-]{36})/);
  if (onLever) return (fetchFn) => lever(fetchFn, onLever[1], onLever[2]);
  const onGreenhouse = url.match(/greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/);
  if (onGreenhouse) return (fetchFn) => greenhouse(fetchFn, onGreenhouse[1], onGreenhouse[2]);
  const onAshby = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)\/([0-9a-f-]{36})/);
  if (onAshby) return (fetchFn) => ashby(fetchFn, onAshby[1], onAshby[2]);
  return null;
}

async function get(fetchFn: Fetch, url: string, body?: unknown): Promise<string> {
  const response = await fetchFn(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'user-agent': 'Mozilla/5.0', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new FormFieldsError(`The form's site answered ${response.status}.`);
  return response.text();
}

// A label as plain text: tags dropped, entities decoded, spaces collapsed.
function clean(text: string | undefined | null) {
  return decodeEntities((text ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// The form's own repeats (such as one survey question per region) would make two Fields with one label.
function withoutRepeats(fields: FieldInput[]) {
  const seen = new Set<string>();
  return fields.filter((field) => !seen.has(field.label) && seen.add(field.label));
}

// A multi-select keeps its options for the Agent but takes a text Answer, since a choice Field holds one option.
function selectField(label: string, options: string[], required: boolean, single: boolean): FieldInput {
  if (single && options.length > 0) return { label, kind: 'choice', options, required };
  return { label, kind: 'short_text', options, required };
}

const resumeLabel = /résumé|resume|\bcv\b/i;

// Ashby: the public GraphQL API its job pages use.
async function ashby(fetchFn: Fetch, organization: string, posting: string): Promise<FormFields> {
  const query =
    'query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) { ' +
    'jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) ' +
    '{ title applicationForm { sections { fieldEntries { field isRequired } } } } }';
  const data = JSON.parse(
    await get(fetchFn, 'https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting', {
      operationName: 'ApiJobPosting',
      query,
      variables: { organizationHostedJobsPageName: organization, jobPostingId: posting },
    }),
  );
  const job = data?.data?.jobPosting;
  if (!job?.applicationForm) throw new FormFieldsError('Ashby has no open posting at that link.');
  type Entry = { field: { title?: string; type?: string; selectableValues?: { label: string }[] }; isRequired?: boolean };
  const entries: Entry[] = job.applicationForm.sections.flatMap((section: { fieldEntries: Entry[] }) => section.fieldEntries);
  return {
    site: 'Ashby',
    role: job.title,
    fields: entries.map(({ field, isRequired }) => {
      const label = clean(field.title);
      const required = isRequired === true;
      const options = (field.selectableValues ?? []).map((value) => value.label);
      switch (field.type) {
        case 'LongText':
          return { label, kind: 'long_text', options: [], required };
        case 'File':
          return { label, kind: 'file', options: [], required };
        case 'Boolean':
          return { label, kind: 'choice', options: ['Yes', 'No'], required };
        case 'ValueSelect':
          return selectField(label, options, required, true);
        case 'MultiValueSelect':
          return selectField(label, options, required, false);
        default:
          return { label, kind: 'short_text', options: [], required };
      }
    }),
  };
}

// Greenhouse: the public job board API, with the form's questions.
async function greenhouse(fetchFn: Fetch, board: string, job: string): Promise<FormFields> {
  const data = JSON.parse(await get(fetchFn, `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${job}?questions=true`));
  type Question = { label: string; required?: boolean; fields?: { type: string; values?: { label: string }[] }[] };
  const questions: Question[] = [...(data.questions ?? []), ...(data.location_questions ?? [])];
  const fields: FieldInput[] = [];
  for (const question of questions) {
    const inputs = question.fields ?? [];
    const types = new Set(inputs.map((input) => input.type));
    if (inputs.length === 0 || [...types].every((type) => type === 'input_hidden')) continue;
    const label = clean(question.label);
    const required = question.required === true;
    const options = inputs.flatMap((input) => (input.values ?? []).map((value) => value.label));
    // "Attach or paste": the Résumé is a file; anything else, such as a cover letter, is text the Agent can draft.
    if (types.has('input_file')) {
      const pasteable = types.has('textarea') && !resumeLabel.test(label);
      fields.push({ label, kind: pasteable ? 'long_text' : 'file', options: [], required });
    } else if (types.has('textarea')) fields.push({ label, kind: 'long_text', options: [], required });
    else if (types.has('multi_value_single_select')) fields.push(selectField(label, options, required, true));
    else if (types.has('multi_value_multi_select')) fields.push(selectField(label, options, required, false));
    else fields.push({ label, kind: 'short_text', options: [], required });
  }
  return { site: 'Greenhouse', role: data.title, company: data.company_name, fields };
}

// Lever: the public apply page, one li.application-question per Field.
async function lever(fetchFn: Fetch, company: string, posting: string): Promise<FormFields> {
  const page = await get(fetchFn, `https://jobs.lever.co/${company}/${posting}/apply`);
  const title = clean(page.match(/<title>([^<]*)<\/title>/i)?.[1]);
  const dash = title.indexOf(' - ');
  return {
    site: 'Lever',
    ...(dash > 0 && { company: title.slice(0, dash), role: title.slice(dash + 3) }),
    fields: leverQuestions(page).map(({ label, kinds, options, required }) => {
      if (kinds.has('file')) return { label, kind: 'file', options: [], required };
      if (kinds.has('textarea')) return { label, kind: 'long_text', options: [], required };
      if (kinds.has('select') || kinds.has('radio')) return selectField(label, options, required, true);
      if (kinds.has('checkbox')) return selectField(label, options, required, false);
      return { label, kind: 'short_text', options: [], required };
    }),
  };
}

type LeverQuestion = { label: string; kinds: Set<string>; options: string[]; required: boolean };

function leverQuestions(page: string): LeverQuestion[] {
  const questions: LeverQuestion[] = [];
  let current: LeverQuestion | null = null;
  let depth = 0;
  let inLabel = 0;
  let inOption = false;

  for (const token of htmlTokens(page)) {
    if (token.type === 'start') {
      const cls = token.attributes.class ?? '';
      if (token.name === 'li' && cls.includes('application-question')) {
        current = { label: '', kinds: new Set(), options: [], required: false };
        depth = 1;
        continue;
      }
      if (!current) continue;
      if (token.name === 'li') depth++;
      if (cls.includes('application-label')) inLabel = 1;
      else if (inLabel && token.name === 'div') inLabel++;
      if (['input', 'textarea', 'select'].includes(token.name)) {
        const kind = token.name === 'input' ? (token.attributes.type ?? 'input') : token.name;
        current.kinds.add(kind);
        if ((kind === 'radio' || kind === 'checkbox') && token.attributes.value?.trim()) current.options.push(token.attributes.value.trim());
        if ('required' in token.attributes) current.required = true;
      }
      if (token.name === 'option') inOption = true;
    } else if (token.type === 'end') {
      if (!current) continue;
      if (inLabel && token.name === 'div') inLabel--;
      if (token.name === 'option') inOption = false;
      if (token.name === 'li' && --depth === 0) {
        current.required ||= current.label.includes('✱');
        current.label = current.label.replaceAll('✱', '').replace(/\s+/g, ' ').trim();
        // Hidden-only questions are bookkeeping, not something the Candidate fills.
        if ([...current.kinds].some((kind) => kind !== 'hidden')) questions.push(current);
        current = null;
      }
    } else if (current) {
      const text = token.text.trim();
      if (inLabel) current.label += ' ' + text;
      if (inOption && text && text !== 'Select...') current.options.push(text);
    }
  }
  return questions;
}

type Token =
  | { type: 'start'; name: string; attributes: Record<string, string> }
  | { type: 'end'; name: string }
  | { type: 'text'; text: string };

// Just enough HTML tokenizing for Lever's form: tags with their attributes and text between them;
// comments, scripts and styles are skipped.
function* htmlTokens(page: string): Generator<Token> {
  const tag = /<!--[^]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|<![^>]*>/g;
  let at = 0;
  for (let match = tag.exec(page); match; match = tag.exec(page)) {
    if (match.index > at) yield { type: 'text', text: decodeEntities(page.slice(at, match.index)) };
    at = tag.lastIndex;
    const [, closing, rawName, rawAttributes] = match;
    if (rawName === undefined) continue;
    const name = rawName.toLowerCase();
    if (closing) {
      yield { type: 'end', name };
      continue;
    }
    if (name === 'script' || name === 'style') {
      const end = page.toLowerCase().indexOf(`</${name}`, at);
      at = end < 0 ? page.length : end;
      tag.lastIndex = at;
      continue;
    }
    yield { type: 'start', name, attributes: parseAttributes(rawAttributes) };
  }
  if (at < page.length) yield { type: 'text', text: decodeEntities(page.slice(at)) };
}

function parseAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [, name, double, single, bare] of raw.matchAll(/([^\s=/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attributes[name.toLowerCase()] = decodeEntities(double ?? single ?? bare ?? '');
  }
  return attributes;
}

const namedEntities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isNaN(code) ? entity : String.fromCodePoint(code);
    }
    return namedEntities[body.toLowerCase()] ?? entity;
  });
}
