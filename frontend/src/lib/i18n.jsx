import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import en from "./en";

// French is the source language: every UI string is written in French in the
// components and used as its own key. Other languages are plain lookup tables
// (see en.js); a missing entry falls back to the French text.
const DICTIONARIES = { fr: null, en };
export const LANGUAGES = [
  { code: "fr", label: "FR", name: "Français" },
  { code: "en", label: "EN", name: "English" },
];
const LANG_KEY = "eccbc.lang";

function initialLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved in DICTIONARIES) return saved;
  } catch {
    // ignore
  }
  return "fr";
}

let current = initialLang();
document.documentElement.lang = current;

export const getLang = () => current;

/** translate("Bonjour {name}", { name }) — usable outside React (API errors, exports). */
export function translate(text, vars) {
  let out = DICTIONARIES[current]?.[text] ?? text;
  if (vars) {
    for (const [key, value] of Object.entries(vars)) out = out.replaceAll(`{${key}}`, value);
  }
  return out;
}

const I18nContext = createContext({ lang: current, setLang: () => {}, t: translate });

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(current);

  const setLang = useCallback((next) => {
    current = next;
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // ignore
    }
    setLangState(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // A new `t` identity per language makes every consumer re-render on switch.
  const value = useMemo(() => ({ lang, setLang, t: (text, vars) => translate(text, vars) }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
export const useT = () => useContext(I18nContext).t;
