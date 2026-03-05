import { Mastra } from '@mastra/core/mastra';
import { registerApiRoute } from '@mastra/core/server';
import { assistant } from './agents/assistant';
import { storage } from './config/storage';

export const mastra = new Mastra({
  agents: { assistant },
  storage: storage(),
  server: {
    apiRoutes: [
      registerApiRoute('/auth/verify', {
        method: 'POST',
        handler: async (c) => {
          const { password } = await c.req.json();
          const expected = process.env.PASSWORD;
          if (!expected) {
            return c.json({ valid: false, error: 'PASSWORD not configured' }, 500);
          }
          return c.json({ valid: password === expected });
        },
      }),
    ],
  },
});
