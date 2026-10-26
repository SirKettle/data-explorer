import { describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { registerDomOnce } from "./test-setup";

/** US070 plan Step 6 — the package's tests and a consuming app's share one `bun test` process. */
describe("registerDomOnce", () => {
  test("registers a DOM, and a second call (or an app's own setup having run first) does not throw", () => {
    expect(GlobalRegistrator.isRegistered).toBe(true);
    expect(() => registerDomOnce()).not.toThrow();
    expect(() => registerDomOnce()).not.toThrow();
    expect(typeof document.createElement).toBe("function");
  });

  test("Bun's own Fetch API is still the global one", () => {
    expect(String(globalThis.fetch)).not.toContain("happy");
    expect(new Response("x")).toBeInstanceOf(Response);
  });
});
