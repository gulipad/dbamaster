import { LibSQLStore } from '@mastra/libsql';
import type { MastraCompositeStore } from '@mastra/core/storage';

let storageSingleton: MastraCompositeStore | undefined;

export function storage(): MastraCompositeStore {
  if (storageSingleton) return storageSingleton;

  storageSingleton = new LibSQLStore({
    id: 'mastra-libsql-store',
    url: 'file:../mastra.db',
  });

  return storageSingleton;
}
