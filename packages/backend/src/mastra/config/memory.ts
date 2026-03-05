import { google } from '@ai-sdk/google';
import { Memory } from '@mastra/memory';
import { storage } from './storage';

let memorySingleton: Memory | undefined;

export function memory(): Memory {
  if (memorySingleton) return memorySingleton;

  memorySingleton = new Memory({
    storage: storage(),
    options: {
      semanticRecall: false,
      generateTitle: {
        model: google('gemini-2.5-flash'),
        instructions:
          'Generate a concise title for this conversation based on the first user message.',
      },
    },
  });

  return memorySingleton;
}
