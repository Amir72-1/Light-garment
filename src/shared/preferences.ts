export type AppLocale = "en" | "am";
export type AppCalendar = "gregorian" | "ethiopian";

export interface UserPreferences {
  locale: AppLocale;
  calendar: AppCalendar;
}

export const defaultUserPreferences: UserPreferences = {
  locale: "en",
  calendar: "gregorian"
};

export function normalizeLocale(value?: string | null): AppLocale {
  return value === "am" ? "am" : "en";
}

export function normalizeCalendar(value?: string | null): AppCalendar {
  return value === "ethiopian" ? "ethiopian" : "gregorian";
}

export function userPreferencesFromRecord(record?: { locale?: string | null; calendar?: string | null } | null): UserPreferences {
  return {
    locale: normalizeLocale(record?.locale),
    calendar: normalizeCalendar(record?.calendar)
  };
}
