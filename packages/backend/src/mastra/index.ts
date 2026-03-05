import { Mastra } from '@mastra/core/mastra';
import { registerApiRoute } from '@mastra/core/server';
import { assistant } from './agents/assistant';
import { storage } from './config/storage';
import { onProgress } from './config/progress';

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
      registerApiRoute('/progress', {
        method: 'GET',
        handler: async (c) => {
          const stream = new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              const send = (msg: string) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
              };
              const unsubscribe = onProgress(send);

              // Keep-alive ping every 15s
              const keepAlive = setInterval(() => {
                controller.enqueue(encoder.encode(': ping\n\n'));
              }, 15_000);

              // Clean up when client disconnects
              c.req.raw.signal.addEventListener('abort', () => {
                unsubscribe();
                clearInterval(keepAlive);
                controller.close();
              });
            },
          });

          return new Response(stream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          });
        },
      }),
    ],
  },
});
