export function connectCommands(mcpUrl: string) {
  return [
    { agent: 'Claude Code', command: `claude mcp add --transport http dossier ${mcpUrl}` },
    { agent: 'Codex', command: `codex mcp add dossier --url ${mcpUrl}` },
  ];
}
