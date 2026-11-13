import { tick } from './studio-dispatch.mjs';

export default {
  fetch: () => new Response(null, { status: 404 }),
  scheduled: (_event, env, ctx) => ctx.waitUntil(tick(env)),
};
