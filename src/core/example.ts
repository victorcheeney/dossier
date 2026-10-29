import { baseResumeName, sameName, type ApplicationInput } from './domain.ts';
import { validateApplication } from './applications.ts';
import { sanitizeResume } from './resume.ts';
import type { NewDocument, Store } from './ports.ts';

export function createExample(store: Store) {
  return {
    has: () => store.hasExample(),
    load(documents: NewDocument[], application: ApplicationInput) {
      if (store.hasExample()) return;
      validateApplication(application);
      const existing = store.listProfileDocuments();
      const added = documents.filter((document) => !existing.some((d) => sameName(d.name, document.name)));
      const resume = sanitizeResume(documents.find((d) => sameName(d.name, baseResumeName))?.text ?? '');
      return store.addExample(added, { ...application, resume, example: true });
    },
    remove: () => store.removeExample(),
  };
}
