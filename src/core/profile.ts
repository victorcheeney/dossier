import { NameTaken, NotFound, Refusal, sameName, type Listener } from './domain.ts';
import type { Store } from './ports.ts';

export function createProfile(store: Store) {
  function find(nameOrId: string | number) {
    return typeof nameOrId === 'number'
      ? store.getProfileDocument(nameOrId)
      : store.listProfileDocuments().find((document) => sameName(document.name, nameOrId)) ?? null;
  }

  function get(nameOrId: string | number) {
    const document = find(nameOrId);
    if (!document) throw new NotFound(`No Profile document matches "${nameOrId}".`);
    return document;
  }

  function name(text: string) {
    if (!text.trim()) throw new Refusal('A document needs a name.');
    return text.trim().normalize('NFC');
  }

  function update(id: number, changes: { name?: string; text?: string }) {
    get(id);
    const next = { ...changes };
    if (next.name !== undefined) {
      next.name = name(next.name);
      const taken = find(next.name);
      if (taken && taken.id !== id) throw new NameTaken(`Another document is already named "${next.name}".`);
    }
    store.updateProfileDocument(id, next);
    return get(id);
  }

  return {
    list: () => store.listProfileDocuments(),
    read(names?: string[]) {
      const all = store.listProfileDocuments();
      return {
        documents: names === undefined ? all : all.filter((d) => names.some((n) => sameName(n, d.name))),
        notFound: names?.filter((n) => !all.some((d) => sameName(n, d.name))) ?? [],
        available: all.map((d) => d.name),
      };
    },
    find,
    get,
    set(documentName: string, text: string) {
      const normalized = name(documentName);
      const existing = find(normalized);
      if (existing) {
        store.updateProfileDocument(existing.id, { text });
        return existing.id;
      }
      return store.addProfileDocument({ name: normalized, text });
    },
    open(documentName: string) {
      let candidate = documentName.trim();
      if (!candidate) {
        for (let n = 1; ; n++) {
          candidate = n === 1 ? 'Untitled' : `Untitled ${n}`;
          if (!find(candidate)) break;
        }
      }
      return find(candidate)?.id ?? store.addProfileDocument({ name: name(candidate), text: '' });
    },
    update,
    edit(nameOrId: string | number, passage: string, replacement: string) {
      const document = get(nameOrId);
      if (passage === '') throw new Refusal('passage must not be empty.');
      const at = document.text.indexOf(passage);
      if (at < 0) throw new Refusal(`"${document.name}" does not contain that passage. Copy the text exactly.`);
      if (document.text.indexOf(passage, at + 1) >= 0) {
        throw new Refusal(`That passage appears more than once in "${document.name}". Include more of the text around it.`);
      }
      return update(document.id, { text: document.text.slice(0, at) + replacement + document.text.slice(at + passage.length) });
    },
    delete(nameOrId: string | number) {
      const document = get(nameOrId);
      store.deleteProfileDocument(document.id);
      return document;
    },
    subscribe: (listener: Listener) => store.subscribeProfile(listener),
  };
}
