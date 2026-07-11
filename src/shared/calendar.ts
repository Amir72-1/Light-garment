import type { AppCalendar, AppLocale } from "./preferences.js";

export interface EthiopianDate {
  year: number;
  month: number;
  day: number;
}

const ETHIOPIAN_MONTHS_EN = [
  "Meskerem",
  "Tikimt",
  "Hidar",
  "Tahsas",
  "Tir",
  "Yekatit",
  "Megabit",
  "Miazia",
  "Ginbot",
  "Sene",
  "Hamle",
  "Nehase",
  "Pagume"
] as const;

const ETHIOPIAN_MONTHS_AM = [
  "መስከረም",
  "ጥቅምት",
  "ኅዳር",
  "ታኅሣሥ",
  "ጥር",
  "የካቲት",
  "መጋቢት",
  "ሚያዝያ",
  "ግንቦት",
  "ሰኔ",
  "ሐምሌ",
  "ነሐሴ",
  "ጳጉሜ"
] as const;

export function parseIsoDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function gregorianToEthiopian(date: Date): EthiopianDate {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  const jdn = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  const r = (jdn - 1723856) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const ethYear = 4 * Math.floor((jdn - 1723856) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460);
  const ethMonth = Math.floor(n / 30) + 1;
  const ethDay = (n % 30) + 1;
  return { year: ethYear, month: ethMonth, day: ethDay };
}

export function ethiopianMonthName(month: number, locale: AppLocale) {
  const index = Math.max(1, Math.min(13, month)) - 1;
  return locale === "am" ? ETHIOPIAN_MONTHS_AM[index] : ETHIOPIAN_MONTHS_EN[index];
}

export function formatEthiopianDate(date: Date, locale: AppLocale) {
  const eth = gregorianToEthiopian(date);
  const monthName = ethiopianMonthName(eth.month, locale);
  return `${eth.day} ${monthName} ${eth.year}`;
}

export function formatGregorianDate(date: Date, locale: AppLocale, options?: Intl.DateTimeFormatOptions) {
  const intlLocale = locale === "am" ? "am-ET" : "en-ET";
  return new Intl.DateTimeFormat(intlLocale, options ?? { year: "numeric", month: "short", day: "numeric" }).format(date);
}

export function formatCalendarDate(value: string | Date, locale: AppLocale, calendar: AppCalendar) {
  const date = typeof value === "string" ? parseIsoDate(value) : value;
  if (calendar === "ethiopian") {
    return formatEthiopianDate(date, locale);
  }
  return formatGregorianDate(date, locale);
}

export function formatCalendarDateTime(value: string | Date, locale: AppLocale, calendar: AppCalendar) {
  const date = typeof value === "string" ? new Date(value) : value;
  const time = new Intl.DateTimeFormat(locale === "am" ? "am-ET" : "en-ET", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
  const datePart = calendar === "ethiopian"
    ? formatEthiopianDate(new Date(date.getFullYear(), date.getMonth(), date.getDate()), locale)
    : formatGregorianDate(date, locale, { year: "numeric", month: "short", day: "numeric" });
  return `${datePart} ${time}`;
}

export function formatCalendarTime(value: string | Date, locale: AppLocale) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale === "am" ? "am-ET" : "en-ET", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function formatCalendarMonthLabel(month: string, locale: AppLocale, calendar: AppCalendar) {
  const [year, monthIndex] = month.split("-").map(Number);
  if (calendar === "ethiopian") {
    const eth = gregorianToEthiopian(new Date(year, monthIndex - 1, 15));
    return `${ethiopianMonthName(eth.month, locale)} ${eth.year}`;
  }
  return new Intl.DateTimeFormat(locale === "am" ? "am-ET" : "en-ET", { month: "long", year: "numeric" }).format(new Date(year, monthIndex - 1, 1));
}
