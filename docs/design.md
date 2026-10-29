# Design decisions

The settled decisions behind Dossier, numbered so they can be referred to. Hard-to-reverse ones also have an ADR in `docs/adr/`. When a decision changes, rewrite it here rather than adding a new one that contradicts it.

## What Dossier is

1. Dossier is an open-source local app, MIT licensed, with a landing page at https://dossier.victorc.dev.
2. The Candidate brings their own Agent; Dossier has no AI. Everything that needs judgment (finding a Posting, drafting Answers, tailoring the Résumé, reading email to move a Stage) is done by the AI chat the Candidate already uses. See `docs/adr/0001-bring-your-own-agent.md`.
3. Every activity in Dossier is a conversation between the Candidate and their Agent. The Agent suggests which tools to connect for context, asks what the Profile should say and what the Candidate is looking for, drafts, and asks again; the Candidate decides. The app shows the result and lets the Candidate review and edit it, so each Application ends up in their own voice. The MCP instructions are written as this conversation, not as steps the Agent runs alone.
4. Dossier tracks the whole search, not only the preparation: the Agent can move an Application through its Stages and add Notes from what it reads elsewhere, such as the Candidate's email.
5. Out of scope: submitting the real form, tags, and job discovery. If discovery comes later, it stays outside the app: MCP instructions that help the Candidate's Agent run its own scheduled search and add the Postings the Candidate picks.

## How it runs

6. One local process serves the page, the MCP server and the SQLite database. TypeScript on Node 24, run directly with no build step, so the code uses erasable syntax only.
7. Data lives in one SQLite file in `data/`, ignored by Git. The server listens on 127.0.0.1 and answers only requests addressed to localhost.
8. Install is `git clone`, `npm install`, `npm start`. The only dependency is the official MCP SDK; SQLite is built into Node.
9. The Agent connects over MCP on local HTTP. Claude Code and Codex are the documented Agents; `npm start` and the first-run page print the connect command for each.
10. The MCP server carries its own instructions for the workflow, so there is no separate skill or prompt to install.

## What the Agent does

11. The Agent gathers everything: the Posting text, its form Fields and anything else. The app never scrapes; its tools create and update records so the page can render them.
12. One exception to 11: `read_form_fields` reads the public form of a Lever, Greenhouse or Ashby posting and returns its Fields. It holds no rule specific to one Candidate; the Agent checks location options against the Candidate's Criteria. On any other site, or when reading fails, the tool says so and tells the Agent to get the Fields another way (its own browser or fetch tools, or asking the Candidate to paste the form).
13. The tools: `read_form_fields`, `get_profile`, `set_profile_document`, `edit_profile_document`, `delete_profile_document`, `add_application`, `update_application`, `list_applications`, `get_application`, `set_stage`, `set_answer`, `set_resume`, `set_summary`, `set_research`, `add_note`.
14. The MCP instructions follow one Application workflow: read the Fields, research the employer, ask the Candidate what each Answer should say, tailor the Résumé, draft the Answers, check every claim.
15. Claims check: every claim in an Answer or Résumé must trace to the Profile or the conversation, or be cut. Dossier stores no sources; the check lives in the instructions and tool descriptions.
16. When the Agent adds an Application, it compares the Posting with the Candidate's Criteria and adds a Note with its view (pay, location, red flags). No scoring.
17. The Agent writes the Summary and the Research; the Candidate reads them and can highlight them.

## The Profile

18. Dossier stores a Profile: named documents shared by every Application. Profiles differ per Candidate, so there can be any number of documents with any names, and the Profile tools handle creating, rewriting, editing part of and deleting any document.
19. A new Profile suggests six starters: Career history, Accomplishments, Base résumé, Voice, Criteria and Stories. None is required. Criteria holds the must-haves plus the kind of role and work the Candidate wants; Stories holds situation, task, action and result stories for interview questions.
20. Building the Profile is guided. With an empty Profile, the Profile page and the first-run page show a prompt to paste into the Agent. The instructions have the Agent ask where the Candidate's past work lives (a résumé file, LinkedIn, Notion, GitHub or GitLab, past reviews, their own words), get access or ask them to paste it, and suggest connecting GitHub or GitLab so it can find forgotten accomplishments in their pull requests.
21. Importing rewrites, it doesn't copy: the Agent turns the sources into Profile documents in the first person, keeping facts and dropping anything about the source itself (file purposes, repo notes, review ratings), and asks the Candidate to check each one.
22. Voice: the Voice document holds the Candidate's writing rules and samples. The instructions have the Agent follow it and do an editing pass before saving any Answer or Résumé, with a short general list of AI tells to remove that applies even when Voice is empty.

## The Application page

23. The home page lists every Application with its Stage, newest first; each opens on a three-column page: the Posting and its tabs (Posting, Summary, Research, Highlights, Notes) on the left, the form in the middle, the Résumé on the right.
24. The Candidate edits Answers on the page and the Agent edits them through MCP; both write the same database. The page updates live and never overwrites the field being typed in.
25. Highlights are written by the Candidate on the page and read by the Agent. A Highlight is saved as its quoted text; if the text changes and a Highlight no longer matches, it stays listed, marked "not found in the posting". There is no separate box for what an Answer should say: the Candidate says it in the chat.
26. A Stage is Preparing, Applied, Interviewing, Offer or Closed; Closed records why (rejected, withdrew, accepted).
27. Notes are dated entries by the Candidate or the Agent, with their source, newest first. The Agent creates them with `add_note`; the Candidate adds, edits and deletes them on the page.
28. First run: with no Applications, the home page shows the connect commands, then "Paste a job posting in your Agent's chat."

## The Résumé

29. A new Application's Résumé starts as a copy of the Base résumé; the Agent tailors the copy. Only the Agent edits it; the page shows it read-only.
30. The Résumé is HTML content stored in the database. One plain template ships with Dossier, a single page in the app's fonts; the Agent writes the content, never the styling.
31. The PDF comes from the browser's own print-to-PDF; no headless browser.
32. One-page check: the Résumé tab warns "Runs onto page 2" with the overflowing lines, and `set_resume` tells the Agent the same so it can shorten the content. A warning, not a stop, since some Candidates need two pages.

## The Example

33. Dossier ships a made-up Candidate (Alex Martin), Profile and Posting ("Product Engineer at Acme") in `example/`, so anyone can try it before adding their own. The Candidate loads and removes it in one click; removing it touches only what it added. The same data feeds the tests, and nothing in it belongs to a real person.

## Look

34. The look is black, white and grey with Instrument Serif titles, adapted from https://victorc.dev; see `design.md`. Highlights are the only color, a soft yellow.

## Tests

35. Tests check behavior through the core on in-memory SQLite, plus adapter tests for what the Candidate sees and the Agent receives. Each rule is tested in the core; adapter tests cover translation, rendering and live updates. No tests of implementation details. `read_form_fields` is tested against saved public form responses in `test/fixtures/`.

## Publishing

36. The public repository starts from a single squashed commit, checked for secrets and personal details, under the maintainer's GitHub noreply address.

## Message

37. The landing page and README lead with "Tailor every job application with your own AI." and five points:
    1. Your context: the Profile (history, accomplishments, base résumé, voice), so drafts start from what's true.
    2. Your judgment: highlight what you like in a posting and note why; you apply to fewer jobs, each one deliberately.
    3. Your review: every Answer and the Résumé side by side; edit anything before it goes out, so what you send is genuine.
    4. Your AI: Claude or Codex, the one you already have; no new subscription.
    5. Your computer: everything stays local in one file; private by default.

## Architecture

38. Use ports and adapters in plain TypeScript. `core/` owns the rules, domain types and the Store and FormReader interfaces. `createCore({ store, formReader })` exposes Applications, Profile and Example use cases. MCP and web adapters call those use cases for every read and write; SQLite and job-board adapters implement the driven ports. `server.ts` wires them together. See ADR 0002.
39. The core throws Refusal for a broken rule and NotFound for a missing record, with one message per rule. MCP returns tool errors; HTTP returns 400 or 404 (409 for a taken Profile document name). Adapters may add recovery hints.
40. The Store emits changes after writes commit. The web adapter subscribes through the core for each open Application or Profile page and sends server-sent events (SSE); the browser refetches what changed. The Store stays a driven adapter. Highlights retain their current behavior; their redesign is separate.
