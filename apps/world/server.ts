/**
 * Serves the app with Bun's HTML bundler: `bun run dev` from here, then open the printed URL.
 * Edits reload in the browser.
 */
import app from "./src/index.html";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3071),
  routes: { "/": app },
  development: true,
});

console.log(`world at ${server.url}`);
