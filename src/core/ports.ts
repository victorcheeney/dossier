import type {
  Application,
  ApplicationInput,
  ApplicationRow,
  ClosedReason,
  FieldInput,
  Highlight,
  HighlightInput,
  Listener,
  NoteInput,
  ProfileDocument,
  Stage,
  Unsubscribe,
} from './domain.ts';

// The ports the core drives. Adapters implement them; the core checks every rule before calling them.

export type StoredApplication = Omit<Application, 'highlights'> & { highlights: Omit<Highlight, 'found'>[] };
export type NewApplication = ApplicationInput & { resume: string; example: boolean };
export type NewDocument = { name: string; text: string };

// Keeps the Profile and the Applications, and tells subscribers about every change after it is written.
export interface Store {
  listApplications(stage?: Stage): ApplicationRow[];
  getApplication(id: number): StoredApplication | null;
  addApplication(application: NewApplication): number;
  updateApplication(id: number, changes: Partial<ApplicationInput>): void;
  deleteApplication(id: number): void;
  setStage(id: number, stage: Stage, reason: ClosedReason | null): void;
  setAnswer(applicationId: number, fieldId: number, text: string): void;
  setSummary(id: number, summary: string): void;
  setResearch(id: number, research: string): void;
  setResume(id: number, resume: string): void;

  addNote(applicationId: number, note: NoteInput): number;
  editNote(applicationId: number, noteId: number, text: string): void;
  deleteNote(applicationId: number, noteId: number): void;

  addHighlight(applicationId: number, highlight: HighlightInput): number;
  // Deleted Highlights count too, so undo can find them.
  hasHighlight(applicationId: number, highlightId: number): boolean;
  setHighlightNote(applicationId: number, highlightId: number, note: string): void;
  setHighlightDeleted(applicationId: number, highlightId: number, deleted: boolean): void;

  listProfileDocuments(): ProfileDocument[];
  getProfileDocument(id: number): ProfileDocument | null;
  addProfileDocument(document: NewDocument): number;
  updateProfileDocument(id: number, changes: Partial<NewDocument>): void;
  deleteProfileDocument(id: number): void;

  // The Example's documents and Application, added together and flagged as the Example.
  addExample(documents: NewDocument[], application: NewApplication): number;
  hasExample(): boolean;
  removeExample(): void;

  subscribe(applicationId: number, listener: Listener): Unsubscribe;
  subscribeProfile(listener: Listener): Unsubscribe;
}

export type FormFields = { site: string; role?: string; company?: string; fields: FieldInput[] };

// Reads the Fields of a public application form. Rejects with a Refusal saying why when it cannot.
export interface FormReader {
  read(link: string): Promise<FormFields>;
}
