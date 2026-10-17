/** Pause graphical work outside the viewport or in a hidden tab; networking stays independent. */
export function observeRenderVisibility(host: HTMLElement, change: (visible: boolean) => void) {
  let intersecting = true;
  let previous: boolean | undefined;
  const update = () => {
    const visible = intersecting && document.visibilityState !== "hidden";
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
  update();
  return () => {
    observer.disconnect();
    document.removeEventListener("visibilitychange", update);
  };
}
