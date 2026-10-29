import { createApplications } from './applications.ts';
import { createExample } from './example.ts';
import { createProfile } from './profile.ts';
import type { FormReader, Store } from './ports.ts';

export function createCore({ store, formReader }: { store: Store; formReader: FormReader }) {
  const profile = createProfile(store);
  return {
    applications: createApplications(store, formReader, profile),
    profile,
    example: createExample(store),
  };
}

export type Core = ReturnType<typeof createCore>;
