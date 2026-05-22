"use client";

import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

const KEY = "overtree.theme";
const EVENT = "overtree:themechange";

export function getTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem(KEY) === "light" ? "light" : "dark";
}

/** Reflect the theme onto <html>. Dark is the CSS default (no attribute). */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (theme === "light") el.dataset.theme = "light";
  else delete el.dataset.theme;
}

export function setTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, theme);
  applyTheme(theme);
  // Keep every mounted consumer (both toggles + the editor) in sync.
  window.dispatchEvent(new CustomEvent<Theme>(EVENT, { detail: theme }));
}

/** Theme state hook backed by localStorage and synced across instances. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  // Start from "dark" so server and first client render match; the real
  // stored value is read after mount to avoid hydration mismatch.
  const [theme, setLocal] = useState<Theme>("dark");

  useEffect(() => {
    setLocal(getTheme());
    const onChange = (e: Event) => {
      setLocal((e as CustomEvent<Theme>).detail);
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  return {
    theme,
    toggle: () => setTheme(theme === "dark" ? "light" : "dark"),
  };
}
