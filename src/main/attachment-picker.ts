import { randomUUID } from "crypto";
import { readFileSync, statSync } from "fs";
import { basename } from "path";
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_IMAGE_INPUT_BYTES,
  MAX_TEXT_BYTES,
  getFileExtension,
  isImageMime,
  isTextFile,
  type Attachment,
} from "../shared/attachments";

export interface SelectAttachmentsResult {
  attachments: Attachment[];
  errors: string[];
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
  text: "text/plain",
  log: "text/plain",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  yaml: "application/yaml",
  yml: "application/yaml",
  toml: "application/toml",
  xml: "application/xml",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  jsx: "text/javascript",
  ts: "text/typescript",
  tsx: "text/typescript",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function guessMime(filePath: string): string {
  return MIME_BY_EXTENSION[getFileExtension(basename(filePath))] || "application/octet-stream";
}

function attachmentError(filePath: string, message: string): string {
  return `${basename(filePath)}: ${message}`;
}

function attachmentFromPath(filePath: string): { attachment?: Attachment; error?: string } {
  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      return { error: attachmentError(filePath, "not a file") };
    }

    const name = basename(filePath);
    const mime = guessMime(filePath);
    const size = stats.size;

    if (isImageMime(mime)) {
      if (size > MAX_IMAGE_INPUT_BYTES) {
        return { error: attachmentError(filePath, "image too large (max 50 MB)") };
      }
      const dataUrl = `data:${mime};base64,${readFileSync(filePath).toString("base64")}`;
      return {
        attachment: {
          id: randomUUID(),
          kind: "image",
          name,
          mime,
          size,
          dataUrl,
          path: filePath,
        },
      };
    }

    if (isTextFile(mime, name)) {
      if (size > MAX_TEXT_BYTES) {
        return { error: attachmentError(filePath, "file too large (max 256 KB)") };
      }
      return {
        attachment: {
          id: randomUUID(),
          kind: "text-file",
          name,
          mime,
          size,
          text: readFileSync(filePath, "utf-8"),
          path: filePath,
        },
      };
    }

    return {
      attachment: {
        id: randomUUID(),
        kind: "path-ref",
        name,
        mime,
        size,
        path: filePath,
      },
    };
  } catch {
    return { error: attachmentError(filePath, "could not be read") };
  }
}

export function selectedAttachmentsFromPaths(filePaths: string[], limit: number): SelectAttachmentsResult {
  const attachments: Attachment[] = [];
  const errors: string[] = [];
  const safeLimit = Math.max(0, Math.min(MAX_ATTACHMENTS_PER_MESSAGE, Math.floor(limit)));

  for (const filePath of filePaths.slice(0, safeLimit)) {
    const result = attachmentFromPath(filePath);
    if (result.attachment) attachments.push(result.attachment);
    if (result.error) errors.push(result.error);
  }

  if (filePaths.length > safeLimit) {
    errors.push(`Too many attachments (max ${MAX_ATTACHMENTS_PER_MESSAGE} per message)`);
  }

  return { attachments, errors };
}
