import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { formatCalendarDate, formatCalendarDateTime, formatCalendarMonthLabel, formatCalendarTime } from "../shared/calendar.js";
import { translate, type TranslationKey } from "../shared/i18n.js";
import { defaultUserPreferences, userPreferencesFromRecord, type AppCalendar, type AppLocale, type UserPreferences } from "../shared/preferences.js";
import type { UserSession } from "../shared/types";
import { persistSession } from "./session";

const PREFERENCES_STORAGE_PREFIX = "lgm-preferences";

type PreferencesContextValue = UserPreferences & {
  t: (key: TranslationKey) => string;
  formatDate: (value: string | Date) => string;
  formatDateTime: (value: string | Date) => string;
  formatTime: (value: string | Date) => string;
  formatMonth: (month: string) => string;
  updatePreferences: (next: Partial<UserPreferences>) => Promise<UserPreferences>;
  saving: boolean;
  savedMessage: string | null;
  errorMessage: string | null;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function readCachedPreferences(userId: string) {
  const saved = localStorage.getItem(`${PREFERENCES_STORAGE_PREFIX}:${userId}`);
  if (!saved) return null;
  try {
    return userPreferencesFromRecord(JSON.parse(saved));
  } catch {
    return null;
  }
}

function writeCachedPreferences(userId: string, preferences: UserPreferences) {
  localStorage.setItem(`${PREFERENCES_STORAGE_PREFIX}:${userId}`, JSON.stringify(preferences));
}

export function PreferencesProvider({
  session,
  onSessionChange,
  children
}: {
  session: UserSession;
  onSessionChange: (session: UserSession) => void;
  children: ReactNode;
}) {
  const [preferences, setPreferences] = useState<UserPreferences>(() => readCachedPreferences(session.user.id) ?? userPreferencesFromRecord(session.user));
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const remotePreferences = useQuery({
    queryKey: ["user-preferences", session.user.id],
    queryFn: () => api.userPreferences(session.token),
    staleTime: 30_000
  });

  useEffect(() => {
    if (!remotePreferences.data) return;
    setPreferences(remotePreferences.data);
    writeCachedPreferences(session.user.id, remotePreferences.data);
    if (session.user.locale === remotePreferences.data.locale && session.user.calendar === remotePreferences.data.calendar) {
      return;
    }
    const nextSession: UserSession = {
      token: session.token,
      user: { ...session.user, locale: remotePreferences.data.locale, calendar: remotePreferences.data.calendar }
    };
    persistSession(nextSession);
    onSessionChange(nextSession);
  }, [remotePreferences.data, session.token, session.user, onSessionChange]);

  useEffect(() => {
    setPreferences(readCachedPreferences(session.user.id) ?? userPreferencesFromRecord(session.user));
  }, [session.user.id, session.user.locale, session.user.calendar]);

  useEffect(() => {
    document.documentElement.lang = preferences.locale;
  }, [preferences.locale]);

  const save = useMutation({
    mutationFn: (body: Partial<UserPreferences>) => api.updateUserPreferences(session.token, body),
    onSuccess: (data) => {
      setPreferences(data);
      writeCachedPreferences(session.user.id, data);
      const nextSession: UserSession = {
        token: session.token,
        user: { ...session.user, locale: data.locale, calendar: data.calendar }
      };
      persistSession(nextSession);
      onSessionChange(nextSession);
      setErrorMessage(null);
      setSavedMessage(translate(data.locale, "settings.saved"));
      window.setTimeout(() => setSavedMessage(null), 2500);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Could not save preferences");
    }
  });

  const value = useMemo<PreferencesContextValue>(() => ({
    ...preferences,
    t: (key) => translate(preferences.locale, key),
    formatDate: (input) => formatCalendarDate(input, preferences.locale, preferences.calendar),
    formatDateTime: (input) => formatCalendarDateTime(input, preferences.locale, preferences.calendar),
    formatTime: (input) => formatCalendarTime(input, preferences.locale),
    formatMonth: (month) => formatCalendarMonthLabel(month, preferences.locale, preferences.calendar),
    updatePreferences: async (next) => save.mutateAsync(next),
    saving: save.isPending,
    savedMessage,
    errorMessage
  }), [preferences, save.isPending, savedMessage, errorMessage]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    const fallbackLocale: AppLocale = defaultUserPreferences.locale;
    const fallbackCalendar: AppCalendar = defaultUserPreferences.calendar;
    return {
      ...defaultUserPreferences,
      t: (key: TranslationKey) => translate(fallbackLocale, key),
      formatDate: (value: string | Date) => formatCalendarDate(value, fallbackLocale, fallbackCalendar),
      formatDateTime: (value: string | Date) => formatCalendarDateTime(value, fallbackLocale, fallbackCalendar),
      formatTime: (value: string | Date) => formatCalendarTime(value, fallbackLocale),
      formatMonth: (month: string) => formatCalendarMonthLabel(month, fallbackLocale, fallbackCalendar),
      updatePreferences: async () => defaultUserPreferences,
      saving: false,
      savedMessage: null,
      errorMessage: null
    } satisfies PreferencesContextValue;
  }
  return context;
}
