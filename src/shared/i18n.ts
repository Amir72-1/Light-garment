import type { AppLocale } from "./preferences.js";

const en = {
  "app.title": "ERP Center",
  "app.subtitle": "Production-ready garment ERP",
  "app.company": "Light Garment Manufacturing PLC",
  "app.signedInAs": "Signed in as",
  "nav.dashboard": "Dashboard",
  "nav.employees": "Employees",
  "nav.attendance": "Attendance",
  "nav.payroll": "Payroll",
  "nav.inventory": "Shirts & Inventory",
  "nav.sales": "POS Sales",
  "nav.production": "Production",
  "nav.reports": "Reports",
  "nav.settings": "Settings",
  "action.logout": "Logout",
  "action.save": "Save",
  "action.saving": "Saving...",
  "settings.company": "Company settings",
  "settings.appearance": "Appearance",
  "settings.appearanceHint": "Use Light, Dark, or follow your system setting.",
  "settings.regional": "Language & calendar",
  "settings.regionalHint": "Choose your language and calendar for dates across the ERP.",
  "settings.language": "Language",
  "settings.calendar": "Calendar",
  "settings.language.en": "English",
  "settings.language.am": "Amharic",
  "settings.calendar.gregorian": "Gregorian",
  "settings.calendar.ethiopian": "Ethiopian",
  "settings.saved": "Preferences saved.",
  "settings.users": "User management",
  "attendance.date": "Date",
  "common.never": "never",
  "common.online": "Online",
  "common.lastSeen": "Last seen"
} as const;

const am: Record<keyof typeof en, string> = {
  "app.title": "የኢአርፒ ማዕከል",
  "app.subtitle": "ለልብስ ምርት ዝግጁ ኢአርፒ",
  "app.company": "ላይት ጋርመንት ማኑፋክቸሪንግ ኃ.የተ.የግ.ማ",
  "app.signedInAs": "እንደ የገቡት",
  "nav.dashboard": "ዳሽቦርድ",
  "nav.employees": "ሰራተኞች",
  "nav.attendance": "አቴንዳንስ",
  "nav.payroll": "ደመወዝ",
  "nav.inventory": "ሸሚዞች እና ክምችት",
  "nav.sales": "የመሸጫ ነጥብ",
  "nav.production": "ምርት",
  "nav.reports": "ሪፖርቶች",
  "nav.settings": "ቅንብሮች",
  "action.logout": "ውጣ",
  "action.save": "አስቀምጥ",
  "action.saving": "በማስቀመጥ ላይ...",
  "settings.company": "የኩባንያ ቅንብሮች",
  "settings.appearance": "መልክ",
  "settings.appearanceHint": "ብርሃን፣ ጨለማ ወይም የስርዓት ቅንብር ይከተሉ።",
  "settings.regional": "ቋንቋ እና የቀን መቁጠሪያ",
  "settings.regionalHint": "ቋንቋዎን እና የቀን መቁጠሪያዎን ይምረጡ።",
  "settings.language": "ቋንቋ",
  "settings.calendar": "የቀን መቁጠሪያ",
  "settings.language.en": "እንግሊዝኛ",
  "settings.language.am": "አማርኛ",
  "settings.calendar.gregorian": "ግሪጎሪያን",
  "settings.calendar.ethiopian": "ኢትዮጵያዊ",
  "settings.saved": "ምርጫዎች ተቀምጠዋል።",
  "settings.users": "የተጠቃሚ አስተዳደር",
  "attendance.date": "ቀን",
  "common.never": "በጭራሽ",
  "common.online": "መስመር ላይ",
  "common.lastSeen": "መጨረሻ የታየው"
};

const catalogs = { en, am };

export type TranslationKey = keyof typeof en;

export function translate(locale: AppLocale, key: TranslationKey) {
  return catalogs[locale][key] ?? catalogs.en[key] ?? key;
}
