"use client";
import { useSyncExternalStore } from "react";
import { THEME_KEY, SYSTEM_THEME_QUERY } from "./theme-init";

export type ThemePreference = "light" | "dark" | "system";
const EVENT = "tablee-theme";
const QUERY = SYSTEM_THEME_QUERY;
const valid = (value: string | null): ThemePreference => value === "light" || value === "dark" ? value : "system";

function apply(preference: ThemePreference) {
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = preference === "system" ? (matchMedia(QUERY).matches ? "dark" : "light") : preference;
  window.dispatchEvent(new Event(EVENT));
}
export function setTheme(preference: ThemePreference) {
  try { localStorage.setItem(THEME_KEY, preference); } catch {}
  apply(preference);
}
function snapshot() {
  const { themePreference = "system", theme = "dark" } = document.documentElement.dataset;
  return `${themePreference}:${theme}`;
}
function subscribe(listener: () => void) {
  const media = matchMedia(QUERY);
  const systemChanged = () => {
    if (document.documentElement.dataset.themePreference === "system") apply("system");
  };
  const storageChanged = (event: StorageEvent) => {
    if (event.key === THEME_KEY || event.key === null) apply(valid(event.newValue));
  };
  media.addEventListener("change", systemChanged);
  window.addEventListener("storage", storageChanged);
  window.addEventListener(EVENT, listener);
  return () => {
    media.removeEventListener("change", systemChanged);
    window.removeEventListener("storage", storageChanged);
    window.removeEventListener(EVENT, listener);
  };
}
export function useTheme() {
  const value = useSyncExternalStore(subscribe, snapshot, () => "system:dark");
  const [preference, theme] = value.split(":") as [ThemePreference, "light" | "dark"];
  return { preference, theme };
}

