import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { type Application, type Change, type ClosedReason, type HighlightTab, NameTaken, NotFound, Refusal, type Stage } from '../../core/domain.ts';
import type { Core } from '../../core/index.ts';
import { exampleApplication, exampleProfile } from '../example-files.ts';
import { handleMcp } from '../mcp.ts';
import { applicationPage } from './pages/application.ts';
import { homePage } from './pages/home.ts';
import { profilePage } from './pages/profile.ts';
import { resumeDocument } from './pages/resume.ts';
import { parseStageChoice } from './pages/stage.ts';

const publicDir = join(import.meta.dirname, '..', '..', '..', 'public');
const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

type Urls = { url: string; mcpUrl: string; port: number };

export async function route(req: IncomingMessage, res: ServerResponse, core: Core, urls: Urls) {
  if (!isLocalHost(req.headers.host, urls.port) || !isLocalOrigin(req.headers.origin, urls.port)) {
    return send(res, 403, 'text/plain; charset=utf-8', 'Dossier only answers its own pages on localhost.');
  }

  const path = new URL(req.url ?? '/', urls.url).pathname;
  if (path === '/mcp') return handleMcp(req, res, core, urls.url);

  const applicationPath = path.match(/^\/applications\/(\d+)(\/.*)?$/);
  if (applicationPath) {
    const application = core.applications.get(Number(applicationPath[1]));
    return routeApplication(req, res, core, application, applicationPath[2] ?? '');
  }

  const profilePath = path.match(/^\/profile(?:\/(\d+|documents|events))?(\/delete)?$/);
  if (profilePath) return routeProfile(req, res, core, profilePath[1], profilePath[2] !== undefined);

  if (path === '/example' || path === '/example/remove') {
    if (req.method !== 'POST') return methodNotAllowed(res);
    if (path === '/example/remove') core.example.remove();
    else core.example.load(exampleProfile(), exampleApplication());
    return redirect(res, '/');
  }

  if (req.method !== 'GET') return methodNotAllowed(res);
  if (path === '/') {
    return sendHtml(
      res,
      homePage(core.applications.list(), urls.mcpUrl, {
        profileIsEmpty: core.profile.list().length === 0,
        hasExample: core.example.has(),
      }),
    );
  }
  return serveStatic(res, path);
}

async function routeProfile(req: IncomingMessage, res: ServerResponse, core: Core, target: string | undefined, isDelete: boolean) {
  if (target === 'events') {
    if (req.method !== 'GET' || isDelete) return notFound(res);
    return streamEvents(req, res, (listener) => core.profile.subscribe(listener));
  }
  if (target === 'documents') {
    if (req.method !== 'POST' || isDelete) return notFound(res);
    const name = new URLSearchParams(await readBody(req)).get('name') ?? '';
    const id = core.profile.open(name);
    return redirect(res, `/profile/${id}`);
  }

  const document = target === undefined ? (core.profile.list()[0] ?? null) : core.profile.get(Number(target));
  if (req.method === 'GET' && !isDelete) return sendHtml(res, profilePage(core.profile.list(), document));
  if (req.method !== 'POST' || !document || target === undefined) return methodNotAllowed(res);

  if (isDelete) {
    core.profile.delete(document.id);
    return redirect(res, '/profile');
  }
  const form = new URLSearchParams(await readBody(req));
  const name = form.get('name');
  const text = form.get('text');
  core.profile.update(document.id, { name: name ?? undefined, text: text ?? undefined });
  return noContent(res);
}

async function routeApplication(
  req: IncomingMessage,
  res: ServerResponse,
  core: Core,
  application: Application,
  action: string,
) {
  const { id } = application;
  if (req.method === 'GET') {
    if (action === '') return sendHtml(res, applicationPage(application));
    if (action === '/resume') {
      const embed = new URL(req.url ?? '', 'http://localhost').searchParams.has('embed');
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        // The Résumé is sanitized; this keeps anything that slips through from running or loading.
        'content-security-policy':
          "default-src 'none'; style-src 'self'; font-src 'self'; script-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
      });
      return res.end(resumeDocument(application, { embed }));
    }
    if (action === '/events') return streamEvents(req, res, (listener) => core.applications.subscribe(id, listener));
    return notFound(res);
  }
  if (req.method !== 'POST') return methodNotAllowed(res);

  const form = new URLSearchParams(await readBody(req));
  if (action === '/delete') {
    core.applications.delete(id);
    return redirect(res, '/');
  }
  if (action === '/stage') {
    const { stage, reason } = parseStageChoice(form.get('stage') ?? '');
    core.applications.setStage(id, stage as Stage, (reason as ClosedReason | undefined) ?? null);
    return redirect(res, `/applications/${id}`);
  }
  const answer = action.match(/^\/answers\/(\d+)$/);
  if (answer) {
    core.applications.setAnswer(id, Number(answer[1]), form.get('text') ?? '');
    return noContent(res);
  }
  if (action === '/highlights') {
    const tab = form.get('tab') as HighlightTab;
    const quote = form.get('quote') ?? '';
    const occurrence = Number(form.get('occurrence') ?? 0);
    const highlightId = core.applications.addHighlight(id, { tab, quote, occurrence, note: form.get('note') ?? '' });
    return send(res, 201, 'application/json', JSON.stringify({ id: highlightId }));
  }
  const highlight = action.match(/^\/highlights\/(\d+)\/(note|delete|restore)$/);
  if (highlight) {
    const highlightId = Number(highlight[1]);
    if (highlight[2] === 'note') core.applications.setHighlightNote(id, highlightId, form.get('note') ?? '');
    else core.applications.setHighlightDeleted(id, highlightId, highlight[2] === 'delete');
    return noContent(res);
  }
  if (action === '/notes') {
    const text = form.get('text') ?? '';
    const noteId = core.applications.addNote(id, { author: 'Candidate', source: '', text });
    return send(res, 201, 'application/json', JSON.stringify({ id: noteId }));
  }
  const note = action.match(/^\/notes\/(\d+)(\/delete)?$/);
  if (note) {
    const noteId = Number(note[1]);
    if (note[2]) {
      core.applications.deleteNote(id, noteId);
      return noContent(res);
    }
    const text = form.get('text') ?? '';
    core.applications.editNote(id, noteId, text);
    return noContent(res);
  }
  return notFound(res);
}

// Server-sent events: one message per change to an Application or to the Profile, so every open page can refresh what changed.
function streamEvents(req: IncomingMessage, res: ServerResponse, subscribe: (listener: (change: Change) => void) => () => void) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
  res.write(': connected\n\n');
  const unsubscribe = subscribe((change) => res.write(`data: ${JSON.stringify(change)}\n\n`));
  req.on('close', unsubscribe);
}

// Refuses DNS rebinding and cross-site form posts: only Dossier's own pages and local Agents reach the data.
function isLocalHost(host: string | undefined, port: number) {
  return [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`].includes(host ?? '');
}

function isLocalOrigin(origin: string | undefined, port: number) {
  if (origin === undefined) return true;
  return URL.canParse(origin) && isLocalHost(new URL(origin).host, port);
}

async function readBody(req: IncomingMessage) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body;
}

function redirect(res: ServerResponse, location: string) {
  res.writeHead(303, { location });
  res.end();
}

function noContent(res: ServerResponse) {
  res.writeHead(204);
  res.end();
}

export function respondToError(res: ServerResponse, error: unknown) {
  if (error instanceof NameTaken) return send(res, 409, 'text/plain; charset=utf-8', error.message);
  if (error instanceof Refusal) return send(res, 400, 'text/plain; charset=utf-8', error.message);
  if (error instanceof NotFound) return send(res, 404, 'text/plain; charset=utf-8', error.message);
  console.error(error);
  if (!res.headersSent) send(res, 500, 'text/plain; charset=utf-8', 'Something went wrong.');
}

function methodNotAllowed(res: ServerResponse) {
  send(res, 405, 'text/plain; charset=utf-8', 'Method not allowed.');
}

async function serveStatic(res: ServerResponse, path: string) {
  const type = contentTypes[extname(path)];
  const file = normalize(join(publicDir, path));
  if (!type || !file.startsWith(publicDir + '/')) return notFound(res);
  try {
    send(res, 200, type, await readFile(file));
  } catch {
    notFound(res);
  }
}

function notFound(res: ServerResponse) {
  send(res, 404, 'text/plain; charset=utf-8', 'Not found.');
}

function sendHtml(res: ServerResponse, body: string, status = 200) {
  send(res, status, 'text/html; charset=utf-8', body);
}

function send(res: ServerResponse, status: number, type: string, body: string | Buffer) {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
}
