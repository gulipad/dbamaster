import { Mastra } from '@mastra/core/mastra';
import { assistant } from './agents/assistant';
import { storage } from './config/storage';

export const mastra = new Mastra({
  agents: { assistant },
  storage: storage(),
});
