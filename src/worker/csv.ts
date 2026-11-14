/**
 * Chunked CSV parsing over a byte stream: each decoded chunk is parsed as it
 * arrives, so a file is never held whole as text.
 */

import Papa from 'papaparse';
import type { Row } from '../metrics/dataset';

/** Minimal Node-style readable, the shape Papa's stream parser accepts. */
class PushStream {
  readable = true;
  private handlers: Record<string, ((x?: unknown) => void)[]> = {};
  read(): void {}
  pause(): void {}
  resume(): void {}
  on(ev: string, fn: (x?: unknown) => void): void {
    (this.handlers[ev] ??= []).push(fn);
  }
  removeListener(ev: string, fn: (x?: unknown) => void): void {
    this.handlers[ev] = (this.handlers[ev] ?? []).filter((f) => f !== fn);
  }
  emit(ev: string, x?: unknown): void {
    for (const f of [...(this.handlers[ev] ?? [])]) {
      f(x);
    }
  }
}

/**
 * Parse a CSV with a header row, handing `onRows` one batch at a time. An
 * exception in `onRows` fails the parse instead of being swallowed by Papa.
 */
export async function streamCsv(
  source: ReadableStream<Uint8Array>,
  onRows: (rows: Row[]) => void
): Promise<number> {
  const stream = new PushStream();
  let failed: unknown = null;
  let count = 0;
  const done = new Promise<void>((resolve) => {
    Papa.parse<Row>(stream as unknown as File, {
      header: true,
      skipEmptyLines: true,
      chunk: (res) => {
        if (failed) {
          return;
        }
        try {
          count += res.data.length;
          onRows(res.data);
        } catch (err) {
          failed = err;
        }
      },
      complete: () => resolve(),
    });
  });

  const reader = source.getReader();
  const decoder = new TextDecoder('utf-8');
  try {
    for (;;) {
      if (failed) {
        throw failed;
      }
      const { done: end, value } = await reader.read();
      if (end) {
        break;
      }
      const text = decoder.decode(value, { stream: true });
      if (text) {
        stream.emit('data', text);
      }
    }
    const tail = decoder.decode();
    if (tail) {
      stream.emit('data', tail);
    }
    stream.emit('end');
    await done;
    if (failed) {
      throw failed;
    }
  } catch (err) {
    await reader.cancel().catch(() => {});
    throw err;
  }
  return count;
}
