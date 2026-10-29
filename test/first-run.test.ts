import assert from 'node:assert/strict';
import { get } from 'node:http';
import { test } from 'node:test';
import { startDossier } from './helpers.ts';

test('the empty home page shows how to connect Claude and Codex', async () => {
  const dossier = await startDossier();
  const home = await dossier.page('/');

  assert.equal(home.status, 200);
  assert.match(home.text, new RegExp(`claude mcp add --transport http dossier ${dossier.app.mcpUrl}`));
  assert.match(home.text, new RegExp(`codex mcp add dossier --url ${dossier.app.mcpUrl}`));
  assert.match(home.text, /Paste a job posting in your Agent's chat\./);
});

test('the page refuses requests addressed to another host', async () => {
  const dossier = await startDossier();
  const status = await new Promise((resolve) => {
    get({ port: dossier.app.port, path: '/', headers: { host: 'evil.example' } }, (res) => resolve(res.statusCode));
  });

  assert.equal(status, 403);
});
