export const fieldKinds = ['short_text', 'long_text', 'file', 'choice'] as const;
export type FieldKind = (typeof fieldKinds)[number];

export const stages = ['Preparing', 'Applied', 'Interviewing', 'Offer', 'Closed'] as const;
export type Stage = (typeof stages)[number];
export const closedReasons = ['rejected', 'withdrew', 'accepted'] as const;
export type ClosedReason = (typeof closedReasons)[number];

export type FieldInput = { label: string; kind: FieldKind; options?: string[]; required?: boolean };

export type ApplicationInput = {
  company: string;
  role: string;
  link: string;
  posting: string;
  pay?: string;
  location?: string;
  fields?: FieldInput[];
};

export type ApplicationRow = {
  id: number;
  company: string;
  role: string;
  link: string;
  pay: string;
  location: string;
  stage: Stage;
  closedReason: ClosedReason | null;
  createdAt: string;
  // Made by loading the Example, so removing the Example removes it.
  example: boolean;
};

export type Field = { id: number; label: string; kind: FieldKind; options: string[]; required: boolean; answer: string };

export const highlightTabs = ['posting', 'research'] as const;
export type HighlightTab = (typeof highlightTabs)[number];

// occurrence: which match of the quote the Candidate selected, counting from 0, when it appears more than once.
export type Highlight = { id: number; tab: HighlightTab; quote: string; occurrence: number; note: string; found: boolean };
export type HighlightInput = { tab: HighlightTab; quote: string; occurrence: number; note: string };

export type Note = { id: number; author: 'Candidate' | 'Agent'; source: string; text: string; createdAt: string };
export type NoteInput = Omit<Note, 'id' | 'createdAt'>;

export type Application = ApplicationRow & {
  posting: string;
  summary: string;
  research: string;
  resume: string;
  fields: Field[];
  highlights: Highlight[];
  notes: Note[];
};

export type ProfileDocument = { id: number; name: string; text: string; updatedAt: string; example: boolean };

export const baseResumeName = 'Base résumé';

// The six documents a new Profile suggests. None is required, and a Candidate can add any others.
export const profileStarters = ['Career history', 'Accomplishments', baseResumeName, 'Voice', 'Criteria', 'Stories'] as const;

// Profile document names match whatever their case or accents' encoding, so "BASE RÉSUMÉ" finds "Base résumé".
export function sameName(a: string, b: string) {
  return nameKey(a) === nameKey(b);
}

function nameKey(name: string) {
  return name.trim().normalize('NFC').toLowerCase();
}

export function wordCount(text: string) {
  return text.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
}

// What changed, sent to every open page after each write.
export type Change = { what: string; fieldId?: number };
export type Listener = (change: Change) => void;
export type Unsubscribe = () => void;

// A request that breaks a rule. The message says which, for the Agent and the Candidate alike.
export class Refusal extends Error {}

// A Profile document name another document already has.
export class NameTaken extends Refusal {}

export class NotFound extends Error {}
