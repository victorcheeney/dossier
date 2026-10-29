import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startApp } from '../src/server.ts';
import { exampleApplication } from '../src/adapters/example-files.ts';

// fetch stands in for the network, which read_form_fields uses; by default every request fails.
export async function startDossier(options: { fetch?: typeof fetch } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dossier-test-'));
  const offline: typeof fetch = async () => {
    throw new Error('Tests do not reach the network.');
  };
  const app = await startApp({ port: 0, dbPath: join(dir, 'dossier.db'), fetch: options.fetch ?? offline });
  const agent = new Client({ name: 'test-agent', version: '1.0.0' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(app.mcpUrl)));

  after(async () => {
    await agent.close();
    await app.close();
    rmSync(dir, { recursive: true });
  });

  return {
    agent,
    async page(path: string) {
      const response = await fetch(app.url + path);
      return { status: response.status, text: await response.text() };
    },
    app,
  };
}

// The Example's Posting, as an Agent would add it.
export const acme = exampleApplication();

type Dossier = Awaited<ReturnType<typeof startDossier>>;

export async function call(dossier: Dossier, name: string, args: Record<string, unknown> = {}) {
  const result = await dossier.agent.callTool({ name, arguments: args });
  const text = (result.content as { text: string }[])[0].text;
  return { isError: result.isError === true, text, value: result.isError ? undefined : JSON.parse(text) };
}

export async function addAcme(dossier: Dossier) {
  const added = await call(dossier, 'add_application', acme);
  assert.equal(added.isError, false, added.text);
  return added.value;
}

// What the page's script does when the Candidate edits something: a form POST from the page's own origin.
export async function postFromPage(dossier: Dossier, path: string, data: Record<string, string> = {}) {
  return fetch(dossier.app.url + path, {
    method: 'POST',
    redirect: 'manual',
    headers: { origin: dossier.app.url },
    body: new URLSearchParams(data),
  });
}

// Listens to an Application's live updates, as an open page does. next() resolves with the next change.
export function listen(dossier: Dossier, applicationId: number) {
  return listenTo(dossier, `/applications/${applicationId}/events`);
}

// Listens to the Profile's live updates, as an open Profile page does.
export function listenToProfile(dossier: Dossier) {
  return listenTo(dossier, '/profile/events');
}

async function listenTo(dossier: Dossier, path: string) {
  const controller = new AbortController();
  const response = await fetch(dossier.app.url + path, { signal: controller.signal });
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  after(() => controller.abort());

  return {
    async next(): Promise<{ what: string; fieldId?: number }> {
      for (;;) {
        const end = buffer.indexOf('\n\n');
        if (end >= 0) {
          const message = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = message.split('\n').find((line) => line.startsWith('data: '));
          if (data) return JSON.parse(data.slice(6));
          continue;
        }
        const { value, done } = await reader.read();
        if (done) throw new Error('The events stream ended.');
        buffer += value;
      }
    },
  };
}

// What the first-run page's "Try the Example" button does.
export async function loadExample(dossier: Dossier) {
  const response = await postFromPage(dossier, '/example');
  assert.equal(response.status, 303);
}
