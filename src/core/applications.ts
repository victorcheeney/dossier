import {
  baseResumeName, closedReasons, fieldKinds, highlightTabs, NotFound, Refusal, stages,
  type Application, type ApplicationInput, type ClosedReason,
  type HighlightInput, type HighlightTab, type Listener, type NoteInput, type Stage,
} from './domain.ts';
import { markdownText } from './markdown.ts';
import { overflowWarning, sanitizeResume } from './resume.ts';
import type { Store, FormReader } from './ports.ts';
import type { createProfile } from './profile.ts';

export function validateApplication(input: Partial<ApplicationInput>, partial = false) {
  for (const key of ['company', 'role', 'link', 'posting'] as const) {
    if ((!partial || input[key] !== undefined) && !input[key]?.trim()) throw new Refusal(`${key} must be text.`);
  }
  input.fields?.forEach((field, i) => {
    if (!field.label.trim()) throw new Refusal(`fields[${i}].label must be text.`);
    if (!fieldKinds.includes(field.kind)) throw new Refusal(`fields[${i}].kind must be one of ${fieldKinds.join(', ')}.`);
    if (field.kind === 'choice' && !field.options?.length) throw new Refusal(`fields[${i}] is a choice Field and needs its options.`);
  });
}

function collapseSpace(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function highlightSource(application: Pick<Application, 'posting' | 'research'>, tab: HighlightTab) {
  return collapseSpace(tab === 'posting' ? application.posting : markdownText(application.research));
}

export function createApplications(store: Store, formReader: FormReader, profile: ReturnType<typeof createProfile>) {
  function get(id: number): Application {
    const application = store.getApplication(id);
    if (!application) throw new NotFound(`No Application has id ${id}.`);
    return {
      ...application,
      highlights: application.highlights.map((highlight) => ({
        ...highlight, found: highlightSource(application, highlight.tab).includes(highlight.quote),
      })),
    };
  }

  function noteText(text: string) {
    if (!text.trim()) throw new Refusal('A Note needs some text.');
    return text.trim();
  }

  function requireNote(id: number, noteId: number) {
    if (!get(id).notes.some((note) => note.id === noteId)) throw new NotFound(`No Note has id ${noteId} on this Application.`);
  }

  function requireHighlight(id: number, highlightId: number) {
    get(id);
    if (!store.hasHighlight(id, highlightId)) throw new NotFound(`No Highlight has id ${highlightId} on this Application.`);
  }

  function requireStage(stage: unknown): asserts stage is Stage {
    if (!stages.includes(stage as Stage)) throw new Refusal(`stage must be one of ${stages.join(', ')}.`);
  }

  return {
    get,
    list(stage?: Stage) {
      if (stage !== undefined) requireStage(stage);
      return store.listApplications(stage);
    },
    readFormFields: (link: string) => formReader.read(link.trim()),
    add(input: ApplicationInput) {
      validateApplication(input);
      return store.addApplication({ ...input, resume: sanitizeResume(profile.find(baseResumeName)?.text ?? ''), example: false });
    },
    update(id: number, changes: Partial<ApplicationInput>) {
      get(id);
      validateApplication(changes, true);
      store.updateApplication(id, changes);
    },
    delete(id: number) {
      get(id);
      store.deleteApplication(id);
    },
    setStage(id: number, stage: Stage, reason?: ClosedReason | null) {
      get(id);
      requireStage(stage);
      if (stage === 'Closed' && !closedReasons.includes(reason as ClosedReason)) {
        throw new Refusal(`A Closed Application needs a reason: ${closedReasons.join(', ')}.`);
      }
      if (stage !== 'Closed' && reason !== undefined && reason !== null) {
        throw new Refusal('Only a Closed Application has a reason.');
      }
      store.setStage(id, stage, stage === 'Closed' ? reason! : null);
    },
    setAnswer(id: number, reference: number | string, text: string) {
      const field = get(id).fields.find((field) => typeof reference === 'number' ? field.id === reference : field.label === reference);
      if (!field) throw new NotFound('No Field matches. Pass its id or exact label.');
      if (field.kind === 'file') throw new Refusal(`"${field.label}" is a file Field: it takes the Résumé, not a text Answer.`);
      if (field.kind === 'choice' && text !== '' && !field.options.includes(text)) {
        throw new Refusal(`"${field.label}" is a choice Field: the Answer must be one of ${field.options.join(', ')}.`);
      }
      store.setAnswer(id, field.id, text);
      return { ...field, answer: text };
    },
    setSummary(id: number, summary: string) {
      get(id);
      store.setSummary(id, summary);
    },
    setResearch(id: number, research: string) {
      get(id);
      store.setResearch(id, research);
    },
    setResume(id: number, html: string) {
      get(id);
      const resume = sanitizeResume(html);
      store.setResume(id, resume);
      return { resume, warning: overflowWarning(resume) };
    },
    addNote(id: number, note: NoteInput) {
      get(id);
      return store.addNote(id, { ...note, text: noteText(note.text), source: note.source.trim() });
    },
    editNote(id: number, noteId: number, text: string) {
      requireNote(id, noteId);
      store.editNote(id, noteId, noteText(text));
    },
    deleteNote(id: number, noteId: number) {
      requireNote(id, noteId);
      store.deleteNote(id, noteId);
    },
    addHighlight(id: number, input: HighlightInput) {
      const application = get(id);
      if (!highlightTabs.includes(input.tab)) throw new Refusal(`tab must be one of ${highlightTabs.join(', ')}.`);
      const quote = collapseSpace(input.quote);
      if (!quote) throw new Refusal('A Highlight needs some text.');
      if (!Number.isInteger(input.occurrence) || input.occurrence < 0) throw new Refusal('occurrence must be a whole number.');
      if (!highlightSource(application, input.tab).includes(quote)) throw new Refusal(`That text is not in the ${input.tab}.`);
      return store.addHighlight(id, { ...input, quote });
    },
    setHighlightNote(id: number, highlightId: number, note: string) {
      requireHighlight(id, highlightId);
      store.setHighlightNote(id, highlightId, note);
    },
    setHighlightDeleted(id: number, highlightId: number, deleted: boolean) {
      requireHighlight(id, highlightId);
      store.setHighlightDeleted(id, highlightId, deleted);
    },
    subscribe(id: number, listener: Listener) {
      get(id);
      return store.subscribe(id, listener);
    },
  };
}
