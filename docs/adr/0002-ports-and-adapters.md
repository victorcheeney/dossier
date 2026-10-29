# Ports and adapters with one core for the Candidate and Agent

Dossier's MCP and web adapters repeated domain checks and had already drifted: only MCP trimmed a Note's source. Put every read and write behind a core that owns the rules and exposes use-case functions. Driving adapters call those functions; SQLite and job-board adapters implement the core's Store and FormReader interfaces. This lets a future CLI reuse the same behavior and lets rule tests call the core without HTTP or MCP.

Use plain TypeScript and explicit `createCore({ store, formReader })` wiring in `server.ts`. A dependency-injection framework would add configuration to wiring that fits in a few lines. The Store interface is deliberate even with one implementation: the core owns what persistence must provide rather than importing SQLite's inferred type. Tests use real SQLite in memory, avoiding a second store whose behavior could drift.

The core throws Refusal or NotFound and owns each rule's message; adapters translate the error and may add recovery hints. Keep change subscriptions on Store, with notifications after commits and SSE in the web adapter. This couples a replacement Store to change delivery, but keeps writes and notices together without an event bus. Move Highlight behavior as it stands; redesigning it is separate work. The database schema and saved data format stay the same.
