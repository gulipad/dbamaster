import { createCapTool } from '../utils/schema-helpers';
import { z } from 'zod';

export const todaysDateTool = createCapTool({
  id: 'todays-date',
  description: 'Returns the current date in ISO 8601 format and long format',
  inputSchema: z.object({}),
  outputSchema: z.object({
    isoDate: z.string().describe('The current date in ISO 8601 format'),
    longDate: z.string().describe('The current date in long format'),
  }),
  execute: async () => {
    const now = new Date();
    const isoDate = now.toISOString().split('T')[0];
    const longDate = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    return { isoDate, longDate };
  },
});
