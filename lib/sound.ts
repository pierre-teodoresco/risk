// One sound switch for the whole hub: muting in any game mutes them all. Until the player has
// used the switch somewhere, each game keeps its own earlier choice and default.
export const SOUND_KEY = "tablee.sound";

/** Whether sound is on; `legacy` is the game's own earlier key, read only before the shared one exists. */
export function soundEnabled(legacy?: string, fallback = true) {
  try {
    const shared = localStorage.getItem(SOUND_KEY);
    if (shared) return shared === "on";
    const old = legacy ? localStorage.getItem(legacy) : null;
    return old ? old === "on" : fallback;
  } catch {
    return fallback;
  }
}
export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {}
}
