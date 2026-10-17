import { test } from "node:test";
import assert from "node:assert/strict";
import { observeRenderVisibility } from "../platform/render-visibility";

test("render visibility combines viewport and tab state, deduplicates changes and cleans up", () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalObserver = Object.getOwnPropertyDescriptor(globalThis, "IntersectionObserver");
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  let intersection!: (entries: { isIntersecting: boolean }[]) => void;
  let observed: unknown, disconnected = false;
  class Observer {
    constructor(callback: typeof intersection) { intersection = callback; }
    observe(host: unknown) { observed = host; }
    disconnect() { disconnected = true; }
  }
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, value: Observer });
  try {
    const host = {} as HTMLElement, changes: boolean[] = [];
    const stop = observeRenderVisibility(host, (visible) => changes.push(visible));
    assert.equal(observed, host);
    intersection([{ isIntersecting: true }]);
    intersection([{ isIntersecting: false }]);
    document.visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    intersection([{ isIntersecting: true }]); // A hidden tab stays asleep on intersection changes.
    assert.deepEqual(changes, [true, false]);
    document.visibilityState = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    assert.deepEqual(changes, [true, false, true]);
    stop();
    assert.ok(disconnected);
    document.visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    assert.deepEqual(changes, [true, false, true]);
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
    if (originalObserver) Object.defineProperty(globalThis, "IntersectionObserver", originalObserver);
    else Reflect.deleteProperty(globalThis, "IntersectionObserver");
  }
});
