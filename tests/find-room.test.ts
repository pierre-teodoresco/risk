import { test } from "node:test";
import assert from "node:assert/strict";
import { findRoom } from "../lib/find-room";

test("room lookup starts every preview together and cancels slow losers", async () => {
  const calls: string[] = [];
  const signals: AbortSignal[] = [];
  let winner!: (r: Response) => void;
  const request = ((url: string, init: RequestInit) => {
    calls.push(url);
    const signal = init.signal!;
    signals.push(signal);
    return new Promise<Response>((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      if (url.includes("game=dames")) winner = resolve;
    });
  }) as typeof fetch;
  const found = findRoom("ABC123", ["mappa", "pioche", "dames"], request);
  assert.equal(calls.length, 3);
  winner(new Response(null, { status: 200 }));
  assert.equal(await found, "dames");
  assert.ok(signals.every((s) => s.aborted));
});

test("room lookup handles missing rooms and bounds an unresponsive preview", async () => {
  assert.equal(await findRoom("ABC123", ["mappa", "dames"], (async () => new Response(null, { status: 404 })) as typeof fetch), null);
  const request = ((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  })) as typeof fetch;
  assert.equal(await findRoom("ABC123", ["mappa"], request, 20), null);
});
