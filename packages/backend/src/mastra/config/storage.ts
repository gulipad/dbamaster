import { LibSQLStore } from '@mastra/libsql';

export const storage = new LibSQLStore({
  id: 'mastra-libsql-store',
  url: 'file:../mastra.db',
});
