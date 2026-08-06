import { extractResumeText } from "./resume.js";
import type { ParsedCandidate, EmailCandidateInput } from "./types.js";

const CRLF = /\r\n/g;
const HEADER_SEPARATOR = /(?:\r?\n){2}/;

export interface ParsedEmail {
  from: string | null;
  subject: string | null;
  body: string;
}

export function parseEmail(raw: string): ParsedEmail {
  const normalized = raw.replace(CRLF, "\n");
  const [head, ...bodyParts] = normalized.split(HEADER_SEPARATOR);
  const headers: Record<string, string> = {};
  let subject: string | null = null;
  let from: string | null = null;

  if (head) {
    for (const line of head.split("\n")) {
      const match = /^([^:]+):\s*(.*)$/.exec(line);
      if (!match) continue;
      const name = match[1]!.toLowerCase().trim();
      const value = match[2]!.trim();
      if (name === "from") from = value;
      if (name === "subject") subject = value;
      if (name === "received" || name === "content-type") continue;
      headers[name] = value;
    }
  }

  return { from, subject, body: bodyParts.join("\n\n") };
}

export function parseNameFromEmail(from: string | null): {
  name: string | null;
  email: string | null;
} {
  if (!from) return { name: null, email: null };
  const angle = /^([^<]*)<([^>]*)>/.exec(from);
  if (angle) {
    return { name: angle[1]!.trim() || null, email: angle[2]!.trim() };
  }
  const bare = from.trim();
  if (bare.includes("@")) {
    return { name: null, email: bare };
  }
  return { name: bare, email: null };
}

export function parseEmailCandidate(
  input: EmailCandidateInput,
): ParsedCandidate | null {
  const { from, subject, body } = parseEmail(input.raw);
  const { name, email } = parseNameFromEmail(from);
  const extracted = extractResumeText(body);
  const fallbackEmail =
    email ??
    subject?.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] ??
    null;

  if (!fallbackEmail || !name || extracted.text.trim().length === 0) {
    return null;
  }

  const candidate: ParsedCandidate = {
    name,
    email: fallbackEmail,
    resumeText: extracted.text,
    source: "email",
  };
  if (input.defaultRoleId) candidate.roleId = input.defaultRoleId;
  return candidate;
}
