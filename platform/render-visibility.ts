/** Let renderers sleep behind a modal without changing networking or game clocks. */
export const notifyModalChange = () => document.dispatchEvent(new Event("tablee:modalchange"));

/** Pause graphical work outside the viewport, in a hidden tab or behind a native modal. */
export function observeRenderVisibility(host: HTMLElement, change: (visible: boolean) => void) {
  let intersecting = true;
  let previous: boolean | undefined;
  const update = () => {
    const visible = intersecting && document.visibilityState !== "hidden" && !document.querySelector("dialog[open]");
    if (visible !== previous) {
      previous = visible;
      change(visible);
    }
  };
  const observer = new IntersectionObserver(([entry]) => {
    intersecting = entry.isIntersecting;
    update();
  });
  observer.observe(host);
  document.addEventListener("visibilitychange", update);
  document.addEventListener("tablee:modalchange", update);
  update();
  return () => {
    observer.disconnect();
    document.removeEventListener("visibilitychange", update);
    document.removeEventListener("tablee:modalchange", update);
  };
}
