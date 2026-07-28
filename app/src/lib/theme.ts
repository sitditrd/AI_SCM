/* 테마 토글 — <html data-theme> + localStorage (레거시 common.js 동작 재현) */
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'twl-theme';

export function getInitialTheme(): Theme {
  const saved = (typeof localStorage !== 'undefined' && localStorage.getItem(KEY)) as Theme | null;
  if (saved === 'light' || saved === 'dark') return saved;
  return 'dark';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) };
}
