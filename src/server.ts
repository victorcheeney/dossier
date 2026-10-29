import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { createCore } from './core/index.ts';
import { openSqliteStore } from './adapters/sqlite.ts';
import { jobBoards, type Fetch } from './adapters/job-boards.ts';
import { route, respondToError } from './adapters/web/routes.ts';
import { connectCommands } from './adapters/web/connect.ts';

export async function startApp(options: { port: number; dbPath: string; fetch?: Fetch }) {
  const store = openSqliteStore(options.dbPath);
  const core = createCore({ store, formReader: jobBoards(options.fetch ?? fetch) });
  const server = createServer((req, res) => {
    route(req, res, core, urls).catch((error) => respondToError(res, error));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.port, '127.0.0.1', resolve);
    });
  } catch (error) {
    store.close();
    throw error;
  }
  const { port } = server.address() as AddressInfo;
  const urls = { url: `http://localhost:${port}`, mcpUrl: `http://localhost:${port}/mcp`, port };
  return {
    ...urls,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      store.close();
    },
  };
}

if (import.meta.main) {
  const app = await startApp({
    port: Number(process.env.PORT ?? 4747),
    dbPath: join(import.meta.dirname, '..', 'data', 'dossier.db'),
  });
  console.log(`Dossier is running at ${app.url}\n`);
  console.log('Connect your Agent with one of these commands:\n');
  for (const { agent, command } of connectCommands(app.mcpUrl)) console.log(`  ${agent}:\n    ${command}\n`);
  console.log("Then paste a job posting in your Agent's chat.");
}
