// Captures Dossier's real pages for the demo video. Starts a throwaway Dossier with the Example, has the Agent's
// tools fill an Application, renders the pages in headless Chrome and saves them as static copies: the markup goes
// into compositions/story.html between its capture markers, the styles into assets/dossier/, the Résumé as an image.
// The video animates these copies; it runs no Dossier of its own. Run it again when Dossier's pages change.
//
//   node video/capture.ts

import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startApp } from '../src/server.ts';
import { exampleApplication } from '../src/adapters/example-files.ts';

const work = '/tmp/dossier-capture';
const port = 4848;
const chromePort = 9334;
// Dossier's page inside the video's window: 1200 CSS pixels wide, as tall as the window's content.
const width = 1200;
const height = 891;
const video = import.meta.dirname;
const repo = join(video, '..');
const assets = join(video, 'assets');
const story = join(video, 'compositions', 'story.html');
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// What the Agent writes in the video.
const fill = { 'Full name': 'Alex Martin', Email: 'alex.martin@example.com', 'LinkedIn or website': 'example.com/alex-martin', 'Are you in Canada?': 'Yes' };
const summary = `## The job
Product Engineer on the Ordering team: talk to grocers, decide what to build, ship it across the web app and API.

## What they want
- Four or more years on web products people pay for
- Strong TypeScript and PostgreSQL
- Talks to users and writes clearly

## How they work
Small teams of four to six, written first, core hours 11:00 to 15:00 Eastern.

## Process
Hiring manager call, paid four-hour take-home, review with two engineers, then a grocer and the CEO. About three weeks.

## Watch out
Two in-person weeks a year.`;
const fitNote =
  'Fits your Criteria: remote in Canada, above your pay floor, small businesses as customers. To weigh: a paid four-hour take-home.';
const highlightQuote = 'experience with retail, inventory or logistics software; you have worked a till or stocked shelves';
const highlightNote = 'Pinecrest! I rebuilt their ordering.';
const draft =
  "At Pinecrest Market I was the only developer for four grocery stores. Every Sunday night a manager copied last week's order into a new spreadsheet, so I built a page that started from last week's order instead. Ordering went from three hours a week per store to one. Acme does the same work for 1,800 stores, and the Ordering team is where I would like to do it.";
const draftEnding = 'Acme does the same work for 1,800 stores, and the Ordering team is where I would like to do it.';
const myEnding = "I'd like to do that again, for 1,800 stores.";
const final = draft.slice(0, draft.length - draftEnding.length) + myEnding;

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const dossier = await startApp({ port, dbPath: join(work, 'capture.db') });
await fetch(`${dossier.url}/example`, { method: 'POST', redirect: 'manual' });
await fetch(`${dossier.url}/applications/1/delete`, { method: 'POST', redirect: 'manual' });
const mcp = new Client({ name: 'dossier-video-capture', version: '1.0.0' });
await mcp.connect(new StreamableHTTPClientTransport(new URL(dossier.mcpUrl)));
const tool = async (name: string, args: object) => {
  const result = await mcp.callTool({ name, arguments: args as Record<string, unknown> });
  const text = (result.content as { text: string }[])[0]?.text ?? '';
  if (result.isError) throw new Error(`${name}: ${text}`);
  return text;
};

const browser = spawn(chrome, [
  '--headless=new',
  `--remote-debugging-port=${chromePort}`,
  `--user-data-dir=${join(work, 'chrome')}`,
  '--hide-scrollbars',
  '--no-first-run',
  ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
  'about:blank',
], { stdio: 'ignore' });

try {
  const cdp = await connect();
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 3, mobile: false });
  await cdp.send('Page.enable');
  const open = async (path: string) => {
    await cdp.send('Page.navigate', { url: `${dossier.url}${path}` });
    await evaluate(cdp, `new Promise((resolve) => { const wait = () => (document.readyState === 'complete' ? document.fonts.ready.then(resolve) : setTimeout(wait, 50)); wait(); })`);
  };

  // The first-run page, before the Agent adds the Application.
  await open('/');
  const home = (await evaluate(cdp, `(${extract})(true)`)).replaceAll(`localhost:${port}`, 'localhost:4747');

  // The Agent fills the Application; the Candidate's Highlight is saved the way the page saves it.
  const id = JSON.parse(await tool('add_application', exampleApplication())).id;
  for (const [label, text] of Object.entries(fill)) await tool('set_answer', { id, label, text });
  await tool('set_summary', { id, summary });
  await tool('add_note', { id, text: fitNote, source: 'the Posting and your Criteria' });
  const highlight = await fetch(`${dossier.url}/applications/${id}/highlights`, {
    method: 'POST',
    body: new URLSearchParams({ tab: 'posting', quote: highlightQuote, occurrence: '0', note: highlightNote }),
  });
  if (!highlight.ok) throw new Error(`Highlight: ${await highlight.text()}`);
  await tool('set_answer', { id, label: 'Why Acme?', text: draft });

  await open(`/applications/${id}`);
  await evaluate(cdp, `new Promise((resolve) => { const wait = () => {
    const frame = document.querySelector('.resume-frame');
    const ready = frame?.style.height && frame.querySelector('iframe').contentDocument?.readyState === 'complete';
    ready ? setTimeout(resolve, 300) : setTimeout(wait, 50);
  }; wait(); })`);
  // The Answer box grows with its text: note its height for each text the video shows.
  await evaluate(cdp, `(() => {
    const box = [...document.querySelectorAll('.field')].find((f) => f.textContent.includes('Why Acme?')).querySelector('textarea');
    const measure = (text) => { box.value = text; box.style.height = 'auto'; return box.scrollHeight + 2 + 'px'; };
    box.dataset.heightEmpty = measure('');
    box.dataset.heightFinal = measure(${JSON.stringify(final)});
    box.dataset.heightDraft = measure(${JSON.stringify(draft)});
    box.id = 'why-acme';
  })()`);
  const resume = await evaluate(cdp, `(() => { const r = document.querySelector('.resume-frame').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...resume, scale: 1 } });
  mkdirSync(join(assets, 'dossier'), { recursive: true });
  writeFileSync(join(assets, 'dossier', 'resume.png'), Buffer.from(shot.data, 'base64'));
  const application = await evaluate(cdp, `(${extract})(false)`);
  cdp.close();

  let html = readFileSync(story, 'utf8');
  html = between(html, 'home', home);
  html = between(html, 'application', application);
  writeFileSync(story, html);
  writeFileSync(join(assets, 'dossier', 'dossier.css'), scopedStyles());
  mkdirSync(join(assets, 'fonts'), { recursive: true });
  for (const font of ['inter-latin.woff2', 'inter-latin-ext.woff2', 'instrument-serif-latin.woff2', 'instrument-serif-latin-ext.woff2']) {
    copyFileSync(join(repo, 'public', 'fonts', font), join(assets, 'fonts', font));
  }
  console.log(`Captured Dossier into ${story} and ${assets}.`);
} finally {
  browser.kill();
  await mcp.close();
  await dossier.close();
  rmSync(work, { recursive: true, force: true });
}

// Runs in the page: the body as static markup, without scripts, frames or handlers.
function extract(dropIds: boolean) {
  const body = document.body.cloneNode(true) as HTMLElement;
  for (const el of body.querySelectorAll('script, noscript')) el.remove();
  for (const frame of body.querySelectorAll('.resume-frame')) {
    frame.innerHTML = '<img src="assets/dossier/resume.png" alt="" class="resume-shot">';
  }
  for (const el of body.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
    if (dropIds) el.removeAttribute('id');
  }
  // Form values live in properties; keep them as attributes so the copy shows them.
  for (const input of body.querySelectorAll('input')) input.setAttribute('value', (input as HTMLInputElement).value);
  for (const box of body.querySelectorAll('textarea')) box.textContent = (box as HTMLTextAreaElement).value;
  return `<div class="dossier ${document.body.className}">${body.innerHTML.trim()}</div>`;
}

function between(html: string, name: string, content: string) {
  const start = `<!-- capture:${name} -->`;
  const end = `<!-- /capture:${name} -->`;
  const from = html.indexOf(start);
  const to = html.indexOf(end);
  if (from < 0 || to < 0) throw new Error(`${story} needs the markers ${start} and ${end}.`);
  return `${html.slice(0, from + start.length)}\n${content}\n${html.slice(to)}`;
}

// Dossier's style sheet, scoped to .dossier so it styles only the page copies, with its fonts under their own names.
function scopedStyles() {
  const fonts = readFileSync(join(repo, 'public', 'fonts.css'), 'utf8')
    .replaceAll('url(/fonts/', 'url(../fonts/')
    .replaceAll("'Inter'", "'Dossier Inter'")
    .replaceAll("'Instrument Serif'", "'Dossier Serif'");
  const styles = readFileSync(join(repo, 'public', 'style.css'), 'utf8')
    .replace(/^@import .*$/m, '')
    .replace(/^:root\b/m, '&')
    .replace(/\bbody\b/g, '&')
    .replaceAll('100vh', '100%')
    .replaceAll("'Instrument Serif'", "'Dossier Serif'")
    .replace(/\bInter\b/g, "'Dossier Inter'");
  return `/* Generated by video/capture.ts from public/style.css and public/fonts.css. */\n${fonts}\n.dossier {\n${styles}\n}\n`;
}

async function connect() {
  let pages: { type: string; webSocketDebuggerUrl: string }[] = [];
  for (let tries = 0; tries < 100 && pages.length === 0; tries++) {
    try {
      pages = ((await (await fetch(`http://127.0.0.1:${chromePort}/json/list`)).json()) as typeof pages).filter((p) => p.type === 'page');
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  const socket = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
  let next = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    const waiting = pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    if (message.error) waiting.reject(new Error(message.error.message));
    else waiting.resolve(message.result);
  });
  return {
    send(method: string, params: object = {}): Promise<any> {
      const id = ++next;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close: () => socket.close(),
  };
}

async function evaluate(cdp: Awaited<ReturnType<typeof connect>>, expression: string) {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
}
