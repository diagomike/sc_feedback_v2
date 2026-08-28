"use client";

import { createContext, useContext, useEffect, useState } from "react";

/** Personal display preferences (dark/light, font size, typeface), ported from v1's
 *  theme-context.tsx. Persisted client-side only (localStorage) — these are per-device
 *  conveniences, not account data. */

type Theme = "light" | "dark";
type FontSize = "small" | "normal" | "large" | "xlarge";
type FontFamily = "sans" | "system" | "serif";

interface ThemeState {
  theme: Theme;
  fontSize: FontSize;
  fontFamily: FontFamily;
  toggle: () => void;
  setFontSize: (v: FontSize) => void;
  setFontFamily: (v: FontFamily) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

function applyAttrs(theme: Theme, fontSize: FontSize, fontFamily: FontFamily) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  if (fontSize === "normal") root.removeAttribute("data-font-size");
  else root.setAttribute("data-font-size", fontSize);
  if (fontFamily === "sans") root.removeAttribute("data-font-family");
  else root.setAttribute("data-font-family", fontFamily);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [fontSize, setFontSizeState] = useState<FontSize>("normal");
  const [fontFamily, setFontFamilyState] = useState<FontFamily>("sans");

  useEffect(() => {
    const storedTheme = (localStorage.getItem("astu-theme") as Theme | null) ?? "light";
    const storedSize = (localStorage.getItem("astu-font-size") as FontSize | null) ?? "normal";
    const storedFamily = (localStorage.getItem("astu-font-family") as FontFamily | null) ?? "sans";
    setTheme(storedTheme);
    setFontSizeState(storedSize);
    setFontFamilyState(storedFamily);
    applyAttrs(storedTheme, storedSize, storedFamily);
  }, []);

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("astu-theme", next);
    applyAttrs(next, fontSize, fontFamily);
  };

  const setFontSize = (v: FontSize) => {
    setFontSizeState(v);
    localStorage.setItem("astu-font-size", v);
    applyAttrs(theme, v, fontFamily);
  };

  const setFontFamily = (v: FontFamily) => {
    setFontFamilyState(v);
    localStorage.setItem("astu-font-family", v);
    applyAttrs(theme, fontSize, v);
  };

  return (
    <ThemeContext.Provider value={{ theme, fontSize, fontFamily, toggle, setFontSize, setFontFamily }}>
      {children}
    </ThemeContext.Provider>
  );
}
