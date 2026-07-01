import Tesseract from "tesseract.js";
import { parseIdCardText, type ScannedIdFields } from "../shared/idScan.js";

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
