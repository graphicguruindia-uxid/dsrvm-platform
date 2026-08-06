import type { ExtractedResume, ResumeExtractionOptions } from "./types.js";

const MARKDOWN_RE = /[#*_>`~]{1,3}/g;
const LINK_RE = /\[([^\]]*)\]\([^)]*\)/g;
const HTML_TAG_RE = /<[^>]+>/g;

const DEFAULT_MAX_LENGTH = 20_000;

export function extractResumeText(
  raw: string,
  options: ResumeExtractionOptions = {},
): ExtractedResume {
  if (!raw || raw.trim().length === 0) {
    return { text: "", pii: [] };
  }
  const pii = detectPii(raw);
  let text = raw
    .replace(/\r\n/g, "\n")
    .replace(HTML_TAG_RE, "\n")
    .replace(LINK_RE, "$1")
    .replace(MARKDOWN_RE, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  if (text.length > maxLength) {
    text = `${text.slice(0, maxLength).trimEnd()}…`;
  }
  return { text, pii };
}

export function normalizeResumeText(raw: string): string {
  return extractResumeText(raw).text;
}

export function detectPii(raw: string): string[] {
  const found = new Set<string>();
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(raw)) {
    found.add("email");
  }
  if (/(\+?\d{1,3}[ -]?)?(\(?\d{3,5}\)?[ -]?\d{3}[ -]?\d{3,4})/.test(raw)) {
    found.add("phone");
  }
  if (
    /(?<![A-Za-z0-9])[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D](?![A-Za-z0-9])/.test(
      raw,
    )
  ) {
    found.add("national_insurance");
  }
  if (
    /(?<![A-Za-z0-9])[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}(?![A-Za-z0-9])/.test(raw)
  ) {
    found.add("postcode");
  }
  return [...found].sort();
}
