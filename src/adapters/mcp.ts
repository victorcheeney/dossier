import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Core } from '../core/index.ts';
import { Refusal, NotFound, type Application, type ProfileDocument, profileStarters, wordCount, type ApplicationInput, type ApplicationRow, type ClosedReason, closedReasons, type FieldInput, fieldKinds, type Stage, stages } from '../core/domain.ts';

type Args = Record<string, unknown>;

// How the Agent works with the Candidate, sent to every Agent when it connects. Kept as Markdown so it is easy to edit.
const instructions = readFileSync(join(import.meta.dirname, '..', 'instructions.md'), 'utf8');

const resumeNote =
  'Write content only, as plain HTML; Dossier\'s one-page Letter template does all the styling. Use <h1> for the name, then a <p> for the headline and a <p> for contact details, <h2> for each section, <h3> for each role as "Title <span>· Employer, place</span> <small>dates</small>", <ul><li> for bullets, <p> with <strong> for skill lines, and <a href="https://…"> for links. Any other tag, every other attribute, styles and scripts are removed.';

const markdownNote = 'Markdown: headings, paragraphs, bullet lists, **bold** and [links](https://…); anything else shows as plain text.';

type Tool = {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  run: (args: Args) => unknown;
};

class ToolError extends Error {}

const applicationProperties = {
  company: { type: 'string', description: 'The employer.' },
  role: { type: 'string', description: 'The job title as the Posting gives it.' },
  link: { type: 'string', description: 'The URL of the Posting.' },
  posting: { type: 'string', description: 'The full Posting text, since postings disappear.' },
  pay: { type: 'string', description: 'Pay as the Posting states it, such as "CA$222K–258K + equity".' },
  location: { type: 'string', description: 'Location as the Posting states it, such as "Remote, GMT+2 to GMT-8".' },
  fields: {
    type: 'array',
    description: "The application form's Fields, in order, as the employer asks them.",
    items: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'The question exactly as the form asks it.' },
        kind: { type: 'string', enum: fieldKinds },
        options: { type: 'array', items: { type: 'string' }, description: 'The choices, for a choice Field.' },
        required: { type: 'boolean' },
      },
      required: ['label', 'kind'],
    },
  },
};

function tools(core: Core, baseUrl: string): Tool[] {
  const pageUrl = (id: number) => `${baseUrl}/applications/${id}`;
  // Only the Example's records say so, so the Agent never mistakes the made-up Candidate for the real one.
  const flagged = <T extends { example: boolean }>({ example, ...rest }: T) => ({ ...rest, ...(example && { example: true }) });
  const listed = (row: ApplicationRow) => ({ ...flagged(row), page: pageUrl(row.id) });
  const full = (application: Application) => ({
    ...flagged(application),
    highlights: application.highlights.map(({ quote, tab, note, found }) => ({ quote, tab, note, found })),
    notes: application.notes.map(({ createdAt, author, source, text }) => ({ date: createdAt, author, source, text })),
    page: pageUrl(application.id),
    resumePage: `${pageUrl(application.id)}/resume`,
  });

  function find(args: Args) {
    const id = args.id;
    if (typeof id !== 'number') throw new ToolError('id must be the number of an Application.');
    const application = core.applications.get(id);
    return application;
  }

  const profileUrl = (document?: ProfileDocument) => `${baseUrl}/profile${document ? `/${document.id}` : ''}`;
  const described = (document: ProfileDocument) => ({
    name: document.name,
    words: wordCount(document.text),
    updated: document.updatedAt,
    page: profileUrl(document),
  });

  function findDocument(args: Args) {
    try {
      return core.profile.get(readName(args.name));
    } catch (error) {
      if (!(error instanceof NotFound)) throw error;
      const names = core.profile.list().map((d) => `"${d.name}"`);
      throw new ToolError(`${error.message} ${names.length ? `The Profile has ${names.join(', ')}.` : 'The Profile is empty.'}`);
    }
  }

  return [
    {
      name: 'read_form_fields',
      description:
        "Read the Fields of a public application form on Lever, Greenhouse or Ashby from the Posting's link, in the shape add_application takes, with the role and company when the form gives them. Check any location options against the Candidate's Criteria. On any other site, or when reading fails, it says so: then get the Fields another way.",
      inputSchema: {
        type: 'object',
        properties: { link: { type: 'string', description: 'The URL of the Posting or its application form.' } },
        required: ['link'],
      },
      async run(args) {
        const link = readText(args.link, 'link').trim();
        try {
          return { link, ...(await core.applications.readFormFields(link)) };
        } catch (error) {
          if (!(error instanceof Refusal)) throw error;
          throw new ToolError(
            `Dossier could not read the Fields from ${link || 'that link'}. ${error.message} Get the Fields another way: open the form with your own browser or fetch tools, or ask the Candidate to paste the form.`,
          );
        }
      },
    },
    {
      name: 'get_profile',
      description:
        "Read the Candidate's Profile: their background, shared by every Application, as named Markdown documents such as Career history, Accomplishments, Base résumé, Voice, Criteria and Stories. Pass names to read only those documents. Read it before drafting Answers or a Résumé, and check each Posting against Criteria. A document marked example belongs to the made-up Example Candidate, not to the Candidate: never use it for their Applications.",
      inputSchema: {
        type: 'object',
        properties: {
          names: { type: 'array', items: { type: 'string' }, description: 'Only these documents. Leave out to read all.' },
        },
      },
      run(args) {
        if (args.names !== undefined && (!Array.isArray(args.names) || args.names.some((n) => typeof n !== 'string'))) {
          throw new ToolError('names must be a list of document names.');
        }
        const { documents, notFound, available } = core.profile.read(args.names as string[] | undefined);
        return {
          documents: documents.map((d) => ({ name: d.name, text: d.text, updated: d.updatedAt, ...(d.example && { example: true }) })),
          ...(notFound.length > 0 && { notFound, available }),
          ...(available.length === 0 && {
            empty: `The Profile is empty. Offer to build it with the Candidate, starting with ${profileStarters.join(', ')}.`,
          }),
          page: profileUrl(),
        };
      },
    },
    {
      name: 'set_profile_document',
      description: `Create a Profile document, or replace the whole text of the one with that name. Write it in the Candidate's first person, from what they gave you, and ask them to check it. Suggested documents: ${profileStarters.join(', ')}; any other name works too. Base résumé holds the résumé every new Application starts from, as HTML content (see set_resume); the others are Markdown. To change one passage, use edit_profile_document instead.`,
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The document name, such as "Career history".' },
          text: { type: 'string', description: 'The whole document.' },
        },
        required: ['name', 'text'],
      },
      run(args) {
        const name = readName(args.name);
        const existed = core.profile.find(name) !== null;
        const id = core.profile.set(name, readText(args.text, 'text'));
        return { ...described(core.profile.find(id)!), created: !existed };
      },
    },
    {
      name: 'edit_profile_document',
      description:
        'Change one passage of a Profile document: give the exact text to find, as get_profile returns it, and what replaces it. The passage must appear exactly once; include more of the text around it if it appears more than once. An empty replacement removes the passage.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The document name.' },
          passage: { type: 'string', description: 'The exact text to replace.' },
          replacement: { type: 'string', description: 'The new text.' },
        },
        required: ['name', 'passage', 'replacement'],
      },
      run(args) {
        const document = findDocument(args);
        const passage = readText(args.passage, 'passage');
        const replacement = readText(args.replacement, 'replacement');
        return described(core.profile.edit(document.id, passage, replacement));
      },
    },
    {
      name: 'delete_profile_document',
      description: 'Delete a Profile document. Only when the Candidate asks.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'The document name.' } },
        required: ['name'],
      },
      run(args) {
        const document = findDocument(args);
        core.profile.delete(document.id);
        return { deleted: document.name, remaining: core.profile.list().map((d) => d.name), page: profileUrl() };
      },
    },
    {
      name: 'add_application',
      description:
        'Add an Application for one Posting the Candidate gave you, with its full text and its form Fields. It starts in the Preparing Stage with an empty Answer per Field. Returns the Application and its page URL.',
      inputSchema: {
        type: 'object',
        properties: applicationProperties,
        required: ['company', 'role', 'link', 'posting'],
      },
      run(args) {
        const id = core.applications.add(readApplication(args, false) as ApplicationInput);
        return full(core.applications.get(id)!);
      },
    },
    {
      name: 'update_application',
      description:
        'Change an Application: pass only what changes. Passing fields replaces the whole Field list; a Field that keeps its label keeps its Answer.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number', description: 'The Application id.' }, ...applicationProperties },
        required: ['id'],
      },
      run(args) {
        const { id } = find(args);
        core.applications.update(id, readApplication(args, true));
        return full(core.applications.get(id)!);
      },
    },
    {
      name: 'list_applications',
      description: 'List the Applications, newest first, optionally only those in one Stage.',
      inputSchema: {
        type: 'object',
        properties: { stage: { type: 'string', enum: stages } },
      },
      run(args) {
        const stage = args.stage;
        return core.applications.list(stage as Stage | undefined).map(listed);
      },
    },
    {
      name: 'get_application',
      description:
        "Everything about one Application: its Posting, its Fields with their Answers, its Résumé (HTML), its Stage, your Summary and Research, its Notes (newest first), and the Candidate's Highlights: passages they marked because they matter to them, each with their note. found is false when the quote no longer appears in the text it came from. Read the Highlights before drafting Answers or the Résumé.",
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number', description: 'The Application id.' } },
        required: ['id'],
      },
      run(args) {
        return full(find(args));
      },
    },
    {
      name: 'set_stage',
      description:
        'Move an Application to another Stage: Preparing, Applied, Interviewing, Offer or Closed. Closed needs a reason: rejected, withdrew or accepted. Use it when the Candidate says so, or when you read, with their permission, that the Application moved, such as an interview invite in their email.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'The Application id.' },
          stage: { type: 'string', enum: stages },
          reason: { type: 'string', enum: closedReasons, description: 'Why it closed. Only for Closed.' },
        },
        required: ['id', 'stage'],
      },
      run(args) {
        const { id } = find(args);
        core.applications.setStage(id, args.stage as Stage, (args.reason as ClosedReason | undefined) ?? null);
        const { stage, closedReason } = core.applications.get(id)!;
        return { id, stage, closedReason, page: pageUrl(id) };
      },
    },
    {
      name: 'set_answer',
      description:
        "Write the Answer for one Field, replacing what is there. Name the Field by its id or its exact label from get_application. The Candidate sees it on the page at once and may edit it; read it back with get_application before changing it again, so you don't overwrite their edits. First check that every claim traces to the Profile or the conversation.",
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'The Application id.' },
          fieldId: { type: 'number', description: 'The Field id.' },
          label: { type: 'string', description: 'The Field label, exactly as get_application gives it. Use it instead of fieldId.' },
          text: { type: 'string', description: 'The whole Answer. For a choice Field, one of its options.' },
        },
        required: ['id', 'text'],
      },
      run(args) {
        const application = find(args);
        const reference = args.fieldId ?? args.label;
        if (typeof reference !== 'number' && typeof reference !== 'string') throw new ToolError('Pass fieldId or the exact label.');
        let field;
        try {
          field = core.applications.setAnswer(application.id, reference, readText(args.text, 'text'));
        } catch (error) {
          if (!(error instanceof NotFound)) throw error;
          throw new ToolError(`${error.message} Fields: ${application.fields.map((f) => `${f.id} "${f.label}"`).join(', ')}.`);
        }
        return { fieldId: field.id, label: field.label, answer: args.text, page: pageUrl(application.id) };
      },
    },
    {
      name: 'set_resume',
      description: `Replace the Application's Résumé, tailored to its Posting. A new Application's Résumé starts as a copy of the Base résumé in the Profile; read it with get_application, tailor it, and pass the whole Résumé. Check that every claim traces to the Profile or the conversation. ${resumeNote} Returns a warning when it probably runs onto a second page.`,
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'The Application id.' },
          html: { type: 'string', description: 'The whole Résumé as HTML content.' },
        },
        required: ['id', 'html'],
      },
      run(args) {
        const { id } = find(args);
        const { warning } = core.applications.setResume(id, readText(args.html, 'html'));
        return { id, resumePage: `${pageUrl(id)}/resume`, page: pageUrl(id), ...(warning && { warning }) };
      },
    },
    {
      name: 'set_summary',
      description:
        `Write your Summary of the Posting, replacing the last one. Keep it short enough to read without scrolling: five short blocks, each a heading with a line or a few bullets: The job, What they want, How they work, Process, Watch out. ${markdownNote}`,
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'The Application id.' },
          summary: { type: 'string', description: 'The Summary, in Markdown.' },
        },
        required: ['id', 'summary'],
      },
      run(args) {
        const { id } = find(args);
        core.applications.setSummary(id, readText(args.summary, 'summary'));
        return { id, page: pageUrl(id) };
      },
    },
    {
      name: 'set_research',
      description:
        `Write what you found about the employer beyond the Posting, replacing the last Research: what the product is and who uses it, what the job builds, reviews (Glassdoor, Reddit), and questions to ask in interviews. Link your sources. The Candidate can highlight it. ${markdownNote}`,
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'The Application id.' },
          research: { type: 'string', description: 'The Research, in Markdown.' },
        },
        required: ['id', 'research'],
      },
      run(args) {
        const { id } = find(args);
        core.applications.setResearch(id, readText(args.research, 'research'));
        return { id, page: pageUrl(id) };
      },
    },
    {
      name: 'add_note',
      description:
        "Add a dated Note to an Application saying what happened, such as your view of the Posting against the Candidate's Criteria, or an interview invite you read in their email. The Note shows as written by the Agent.",
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'The Application id.' },
          text: { type: 'string', description: 'What happened, in a sentence or two of plain text.' },
          source: {
            type: 'string',
            description: 'Where it came from, such as "the Posting and your Criteria" or "your email, Oct 28".',
          },
        },
        required: ['id', 'text', 'source'],
      },
      run(args) {
        const { id } = find(args);
        const text = readText(args.text, 'text');
        const noteId = core.applications.addNote(id, { author: 'Agent', source: readText(args.source, 'source'), text });
        const note = core.applications.get(id)!.notes.find((n) => n.id === noteId)!;
        return { id, note: { date: note.createdAt, author: note.author, source: note.source, text: note.text }, page: pageUrl(id) };
      },
    },
  ];
}

function readText(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new ToolError(`${name} must be text.`);
  return value;
}

function readName(value: unknown): string {
  return readText(value, 'name');
}

function readApplication(args: Args, partial: boolean): Partial<ApplicationInput> {
  const input: Partial<ApplicationInput> = {};
  for (const key of ['company', 'role', 'link', 'posting', 'pay', 'location'] as const) {
    const value = args[key];
    const required = !partial && ['company', 'role', 'link', 'posting'].includes(key);
    if (value === undefined && !required) continue;
    if (typeof value !== 'string') throw new ToolError(`${key} must be text.`);
    input[key] = value;
  }
  if (args.fields !== undefined) input.fields = readFields(args.fields);
  return input;
}

function readFields(value: unknown): FieldInput[] {
  if (!Array.isArray(value)) throw new ToolError('fields must be a list.');
  return value.map((field, i) => {
    const where = `fields[${i}]`;
    if (typeof field?.label !== 'string') throw new ToolError(`${where}.label must be text.`);
    if (typeof field.kind !== 'string') throw new ToolError(`${where}.kind must be text.`);
    const options = field.options ?? [];
    if (!Array.isArray(options) || options.some((option: unknown) => typeof option !== 'string')) {
      throw new ToolError(`${where}.options must be a list of text.`);
    }
    return { label: field.label, kind: field.kind, options, required: field.required === true };
  });
}

function createServer(core: Core, baseUrl: string) {
  const all = tools(core, baseUrl);
  // The low-level Server takes plain JSON Schema; McpServer would need zod as a second dependency.
  const server = new Server({ name: 'dossier', version: '0.1.0' }, { capabilities: { tools: {} }, instructions });

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: all.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = all.find((t) => t.name === request.params.name);
    if (!tool) return failure(`Unknown tool: ${request.params.name}`);
    try {
      const result = await tool.run(request.params.arguments ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      if (error instanceof ToolError || error instanceof Refusal || error instanceof NotFound) return failure(error.message);
      throw error;
    }
  });

  return server;
}

function failure(message: string) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

// Stateless: a fresh server and transport per request, so nothing lives between calls but the database.
export async function handleMcp(req: IncomingMessage, res: ServerResponse, core: Core, baseUrl: string) {
  const server = createServer(core, baseUrl);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}
