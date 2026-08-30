import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import fr from "./fr";
import en from "./en";
import ar from "./ar";
import { toUpper } from "../lib/utils";

/** Translation keys whose values should NOT be uppercased */
const CASE_PRESERVE_KEYS = new Set([
  "auth.email",
  "auth.password",
  "members.email",
  "staff.email",
  "settings.email",
  "profile.email",
  "auth.login",
  "auth.username",
  "auth.pin",
  "auth.otp",
  "auth.token",
  "settings.apiKey",
  "settings.url",
  // Chat IA : textes longs/messages à casse normale (le toUpperCase global
  // transformait les messages du chat en MAJUSCULES, incohérent avec les
  // réponses LLM en minuscules).
  "aiAssistant.chatTitle",
  "aiAssistant.chatSubtitle",
  "aiAssistant.chatWelcome",
  "aiAssistant.chatThinking",
  "aiAssistant.chatPlaceholder",
  "aiAssistant.chatReset",
  "aiAssistant.chatClose",
]);

type TranslationValue = string | Record<string, unknown>;

interface I18nContextValue {
  locale: string;
  t: (key: string) => string;
  setLocale: (locale: string) => void;
}

const translations: Record<string, Record<string, TranslationValue>> = {
  fr,
  en,
  ar,
};

function getInitialLocale(): string {
  if (typeof window === "undefined") return "fr";
  const stored = localStorage.getItem("locale");
  if (stored && translations[stored]) return stored;
  const navLang = navigator.language?.slice(0, 2);
  if (navLang && translations[navLang]) return navLang;
  return "fr";
}

function resolveKey(obj: Record<string, TranslationValue>, key: string): string {
  const parts = key.split(".");
  let current: TranslationValue = obj;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return key;
    current = (current as Record<string, TranslationValue>)[part];
  }
  return typeof current === "string" ? current : key;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState(getInitialLocale);

  const setLocale = useCallback((newLocale: string) => {
    if (translations[newLocale]) {
      setLocaleState(newLocale);
      localStorage.setItem("locale", newLocale);
    }
  }, []);

  const t = useCallback(
    (key: string): string => {
      const dict = translations[locale] as Record<string, TranslationValue> | undefined;
      if (!dict) return toUpper(key);
      const value = resolveKey(dict, key);
      return CASE_PRESERVE_KEYS.has(key) ? value : toUpper(value);
    },
    [locale],
  );

  useEffect(() => {
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
  }, [locale]);

  const ctxValue = useMemo(() => ({ locale, t, setLocale }), [locale, t, setLocale])
  return (
    <I18nContext.Provider value={ctxValue}>
      {children}
    </I18nContext.Provider>
  );
}

export function useLocale(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useLocale must be used within an I18nProvider");
  return ctx;
}

export function useT(): I18nContextValue["t"] {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within an I18nProvider");
  return ctx.t;
}
