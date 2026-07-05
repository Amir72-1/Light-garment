import type { Gender } from "./types.js";

export interface ScannedIdFields {
  fullName?: string;
  faydaNumber?: string;
  dateOfBirth?: string;
  gender?: Gender;
}

const faydaPatterns = [
  /\b(FIN[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})\b/i,
  /(?:FIN|FAYDA(?:\s*(?:ID|NUMBER|NO\.?))?)[:\s-]*([A-Z0-9][A-Z0-9\-/\s]{6,}?)(?=\s*(?:DATE|DOB|BIRTH|GENDER|SEX|$))/i,
  /\b(\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4})\b/
];

const dobPatterns = [
  /(?:DOB|DATE\s+OF\s+BIRTH|BIRTH\s+DATE|BORN)[:\s-]*(\d{4}[-/]\d{2}[-/]\d{2})/i,
  /(?:DOB|DATE\s+OF\s+BIRTH|BIRTH\s+DATE|BORN)[:\s-]*(\d{1,2}[-/]\d{1,2}[-/]\d{4})/i,
  /\b(\d{4}-\d{2}-\d{2})\b/,
  /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/
];

const genderPatterns = [
  /(?:SEX|GENDER)[:\s-]*(MALE|FEMALE|M|F)\b/i,
  /\b(MALE|FEMALE)\b/i
];

const namePatterns = [
  /(?:FULL\s+NAME|NAME|FULLNAME)[:\s-]*([A-Za-z][A-Za-z\s'.-]{2,}?)(?=\s*(?:FIN|FAYDA|DOB|DATE|GENDER|SEX|$))/i
];

function normalizeDate(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const slash = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (slash) {
    const [, day, month, year] = slash;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return trimmed;
}

function normalizeFayda(value: string) {
  const finMatch = value.toUpperCase().match(/FIN[-\s]?(\d{4})[-\s]?(\d{4})[-\s]?(\d{4})/);
  if (finMatch) {
    return `FIN-${finMatch[1]}-${finMatch[2]}-${finMatch[3]}`;
  }
  const digitsOnly = value.replace(/\D/g, "");
  if (digitsOnly.length === 16) {
    return `${digitsOnly.slice(0, 4)}-${digitsOnly.slice(4, 8)}-${digitsOnly.slice(8, 12)}-${digitsOnly.slice(12, 16)}`;
  }
  return value.replace(/\s+/g, "-").trim().toUpperCase().replace(/-+/g, "-");
}

function normalizeGender(value: string): Gender | undefined {
  const token = value.trim().toUpperCase();
  if (token === "M" || token === "MALE") return "Male";
  if (token === "F" || token === "FEMALE") return "Female";
  return undefined;
}

function cleanName(value: string) {
  return value
    .replace(/\s+(FIN|FAYDA|DOB|DATE|GENDER|SEX).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function guessNameFromLines(lines: string[]) {
  const candidates = lines
    .map((line) => cleanName(line.replace(/^name[:\s-]*/i, "")))
    .filter((line) => /^[A-Za-z][A-Za-z\s'.-]{4,}$/.test(line))
    .filter((line) => !/(FIN|FAYDA|MALE|FEMALE|DATE|BIRTH|GENDER|SEX|ETHIOPIA|REPUBLIC|DOB)/i.test(line))
    .sort((left, right) => right.length - left.length);
  return candidates[0];
}

export function parseIdCardText(text: string): ScannedIdFields {
  const normalized = text.replace(/\r/g, "\n");
  const flat = normalized.replace(/\n+/g, " ");
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const result: ScannedIdFields = {};

  for (const pattern of faydaPatterns) {
    const match = flat.match(pattern);
    if (match?.[1]) {
      result.faydaNumber = normalizeFayda(match[1]);
      break;
    }
  }

  for (const pattern of dobPatterns) {
    const match = flat.match(pattern);
    if (match?.[1]) {
      result.dateOfBirth = normalizeDate(match[1]);
      break;
    }
  }

  for (const pattern of genderPatterns) {
    const match = flat.match(pattern);
    if (match?.[1]) {
      result.gender = normalizeGender(match[1]);
      if (result.gender) break;
    }
  }

  for (const pattern of namePatterns) {
    const match = flat.match(pattern);
    if (match?.[1]) {
      result.fullName = cleanName(match[1]);
      break;
    }
  }

  if (!result.fullName) {
    result.fullName = guessNameFromLines(lines);
  }

  return result;
}
