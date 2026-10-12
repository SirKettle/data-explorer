import { GlobalRegistrator } from "@happy-dom/global-registrator";

/**
 * Registers a `happy-dom` DOM for this package's component tests (US070 plan Step 6). Import it
 * first in any test that renders.
 *
 * A consuming app's test suite may run in the same `bun test` process and register its own DOM:
 * `GlobalRegistrator.register()` throws if called twice, so this registers only when nothing has
 * yet. It never unregisters, for the same reason (another file may still need the DOM).
 *
 * happy-dom also replaces the global Fetch API. Bun's native `fetch`, `Request`, `Response` and
 * `Headers` are restored, so tests elsewhere in the process that rely on them keep working.
 */
export function registerDomOnce(): void {
  if (GlobalRegistrator.isRegistered) return;
  const nativeFetch = globalThis.fetch;
  const NativeRequest = globalThis.Request;
  const NativeResponse = globalThis.Response;
  const NativeHeaders = globalThis.Headers;
  GlobalRegistrator.register();
  globalThis.fetch = nativeFetch;
  globalThis.Request = NativeRequest;
  globalThis.Response = NativeResponse;
  globalThis.Headers = NativeHeaders;
}

registerDomOnce();
