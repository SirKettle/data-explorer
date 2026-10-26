// The texture cache's rules — US071 Step 6 (ADR-016 A25 clause 4).
//
// Pure, so the budget, the eviction order and the "texture, shape or load?" decision are tested
// without WebGL. `renderer-pixi/textures.ts` owns the actual images and GPU textures and asks this
// module what to keep.

export type TextureStatus = "loading" | "ready" | "failed";

/** What to draw for one item this frame. */
export type TextureDecision = "texture" | "shape" | "load";

/**
 * Below `minDiameterPx` on screen an image is not worth its memory: draw the shape, and do not
 * load. Above it, draw a ready texture, start loading an unknown one (drawing the shape
 * meanwhile), and keep drawing the shape for one still loading or one that failed.
 */
export function textureDecision(diameterPx: number, minDiameterPx: number, status: TextureStatus | undefined): TextureDecision {
  if (diameterPx < minDiameterPx) return "shape";
  if (status === undefined) return "load";
  return status === "ready" ? "texture" : "shape";
}

interface Entry<T> {
  status: TextureStatus;
  value: T | null;
  /** The frame it was last drawn in. */
  usedAt: number;
}

/**
 * Keyed entries with a budget on how many may hold a value (`ready`) or be about to (`loading`).
 * Entries drawn in the current frame are never evicted, so a frame that needs more than the
 * budget draws the rest as shapes rather than thrashing. A failure is remembered (and costs no
 * budget), so a bad URL is neither retried every frame nor reported twice.
 */
export class TextureBudget<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private frame = 0;

  constructor(
    private budget: number,
    private readonly dispose: (value: T) => void,
  ) {}

  /** Starts a new frame: entries touched from now on count as in use. */
  beginFrame(): void {
    this.frame++;
  }

  status(key: string): TextureStatus | undefined {
    return this.entries.get(key)?.status;
  }

  /** Marks an entry drawn this frame and returns its value when ready. */
  use(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    entry.usedAt = this.frame;
    return entry.status === "ready" ? entry.value : null;
  }

  /** Whether a new load fits: evicting anything not drawn this frame first, if that makes room. */
  reserve(key: string): boolean {
    if (this.entries.has(key)) return false;
    if (this.held() >= this.budget) this.evict(this.held() - this.budget + 1);
    if (this.held() >= this.budget) return false;
    this.entries.set(key, { status: "loading", value: null, usedAt: this.frame });
    return true;
  }

  /** A reserved load finished. Returns false (and disposes the value) if it was dropped meanwhile. */
  resolve(key: string, value: T): boolean {
    const entry = this.entries.get(key);
    if (!entry || entry.status !== "loading") {
      this.dispose(value);
      return false;
    }
    entry.status = "ready";
    entry.value = value;
    return true;
  }

  /** A reserved load failed. Returns true the first time, so the caller reports it once. */
  fail(key: string): boolean {
    const entry = this.entries.get(key);
    if (entry?.status === "failed") return false;
    this.entries.set(key, { status: "failed", value: null, usedAt: this.frame });
    return true;
  }

  setBudget(budget: number): void {
    this.budget = budget;
    if (this.held() > budget) this.evict(this.held() - budget);
  }

  /** Entries holding (or about to hold) a value: what the budget counts. */
  held(): number {
    let count = 0;
    for (const entry of this.entries.values()) if (entry.status !== "failed") count++;
    return count;
  }

  /** Disposes every value. Failures are forgotten too, so a later attempt may report again. */
  clear(): void {
    for (const entry of this.entries.values()) if (entry.value !== null) this.dispose(entry.value);
    this.entries.clear();
  }

  /** Drops up to `count` ready entries not drawn this frame, least recently drawn first. A load
   *  in flight is never dropped here: `resolve` would only have to throw its result away. */
  private evict(count: number): void {
    const candidates = [...this.entries.entries()]
      .filter(([, entry]) => entry.status === "ready" && entry.usedAt < this.frame)
      .sort((a, b) => a[1].usedAt - b[1].usedAt)
      .slice(0, count);
    for (const [key, entry] of candidates) {
      this.dispose(entry.value!);
      this.entries.delete(key);
    }
  }
}
