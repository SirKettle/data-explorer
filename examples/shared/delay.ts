/** A pretend network: resolves after `ms`, so loading and previews are visible in the examples. */
export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
