import type { Express } from "express";

const allowedImageMime = /^image\/(png|jpe?g|webp|gif)$/;

export function imageFileToDataUrl(file: Express.Multer.File) {
  const mime = allowedImageMime.test(file.mimetype) ? file.mimetype : "image/jpeg";
  return `data:${mime};base64,${file.buffer.toString("base64")}`;
}

export function normalizeProfileImageUrl(value?: string | null) {
  if (!value) return undefined;
  if (value.startsWith("data:image/")) return value;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return undefined;
}
