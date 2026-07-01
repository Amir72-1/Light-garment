import Tesseract from "tesseract.js";
import { parseIdCardText, type ScannedIdFields } from "../shared/idScan.js";

function mergeScannedFields(current: ScannedIdFields, next: ScannedIdFields): ScannedIdFields {
  return {
    fullName: current.fullName || next.fullName,
    faydaNumber: current.faydaNumber || next.faydaNumber,
    dateOfBirth: current.dateOfBirth || next.dateOfBirth,
    gender: current.gender || next.gender
  };
}

export async function scanEmployeeId(
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ fields: ScannedIdFields; rawText: string }> {
  const result = await Tesseract.recognize(file, "eng", {
    logger: (message) => {
      if (message.status === "recognizing text" && typeof message.progress === "number") {
        onProgress?.(message.progress);
      }
    }
  });

  const rawText = result.data.text.trim();
  const fields = parseIdCardText(rawText);
  return { fields, rawText };
}

export async function scanEmployeeIdSides(
  files: { front?: File | null; back?: File | null },
  onProgress?: (progress: number) => void
): Promise<{ fields: ScannedIdFields; rawText: string }> {
  const sides = [
    files.front ? { label: "front", file: files.front } : null,
    files.back ? { label: "back", file: files.back } : null
  ].filter(Boolean) as Array<{ label: string; file: File }>;

  if (!sides.length) {
    return { fields: {}, rawText: "" };
  }

  let merged: ScannedIdFields = {};
  let rawText = "";

  for (const [index, side] of sides.entries()) {
    const result = await scanEmployeeId(side.file, (progress) => {
      onProgress?.((index + progress) / sides.length);
    });
    merged = mergeScannedFields(merged, result.fields);
    rawText += `${side.label.toUpperCase()}:\n${result.rawText}\n\n`;
  }

  return { fields: merged, rawText: rawText.trim() };
}
