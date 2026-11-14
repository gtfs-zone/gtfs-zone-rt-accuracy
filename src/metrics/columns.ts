/** Growable typed columns and a string pool for the dataset builder. */

type TypedArray = Float64Array | Int32Array | Uint32Array;
type TypedCtor<T extends TypedArray> = new (n: number) => T;

const CHUNK = 1 << 16;

/**
 * An append-only typed column in fixed-size chunks, so growing it never
 * copies what is already there.
 */
export class Grow<T extends TypedArray> {
  private chunks: T[] = [];
  private last: T;
  private at = CHUNK;
  length = 0;

  constructor(private readonly ctor: TypedCtor<T>) {
    this.last = new ctor(0);
  }

  push(v: number): void {
    if (this.at === CHUNK) {
      this.last = new this.ctor(CHUNK);
      this.chunks.push(this.last);
      this.at = 0;
    }
    this.last[this.at++] = v;
    this.length++;
  }

  get(i: number): number {
    return this.chunks[i >>> 16][i & (CHUNK - 1)];
  }

  /** One contiguous array; the chunks are dropped. */
  take(): T {
    const out = new this.ctor(this.length);
    let at = 0;
    for (const c of this.chunks) {
      const n = Math.min(CHUNK, this.length - at);
      out.set(n === CHUNK ? c : (c.subarray(0, n) as T), at);
      at += n;
    }
    this.chunks = [];
    this.length = 0;
    this.at = CHUNK;
    return out;
  }
}

/** String pool: each distinct string once, by id. */
export class Interner {
  private map = new Map<string, number>();
  readonly strs: string[] = [];

  id(s: string): number {
    let i = this.map.get(s);
    if (i === undefined) {
      // Parsed values are slices of a whole CSV chunk; a copy keeps the pool
      // from holding every chunk alive.
      const own = (' ' + s).slice(1);
      i = this.strs.length;
      this.strs.push(own);
      this.map.set(own, i);
    }
    return i;
  }

  /** Id of `s`, or -1 when the pool has never seen it. */
  lookup(s: string): number {
    return this.map.get(s) ?? -1;
  }
}
