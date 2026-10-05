import type { RoleProfile } from "../types.js";
import { extractResumeText } from "./resume.js";

export interface DraftExtraction {
  name: string;
  email: string;
  resumeText: string;
}

export interface RoleMatch {
  roleId: string;
  title: string;
  score: number;
  reasons: string[];
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

// A word that looks like a person name component: Title Case or ALL CAPS,
// no digits, no email fragments.
const NAME_WORD_RE = /^[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'\u2019-]*$/;

// Explicit "Name:" / "Name -" style labels.
const NAME_LABEL_RE = /^\s*(?:full\s+)?name\s*[:\-]\s*(.+)$/i;

// Lines that are almost never a person's name.
const NON_NAME_LINES = [
  /^(?:contact|email|e-mail|phone|mobile|address|linkedin|github|portfolio|summary|profile|experience|employment|education|skills|languages|references|objective|career|about|awards|certifications|projects|publications|hobbies|interests|availability|work permit|authorized to work)\b/i,
  /^(?:current|present|recent|professional|technical|functional|industry)\s+(?:experience|skills?|profile|summary)/i,
];

// Words that flag a line as a job title rather than a person name.
const TITLE_WORD_RE =
  /\b(senior|junior|lead|staff|principal|head|chief|vice|president|founder|owner|director|manager|engineer|developer|architect|designer|analyst|consultant|specialist|scientist|researcher|intern|trainee|apprentice|graduate|student|candidate|candidate|officer|executive|coordinator|administrator|technician|nurse|doctor|teacher|professor|lawyer|attorney|accountant|recruiter|recruiting|candidate|profile|resume|cv|curriculum|vitae|professional|self[- ]?employed|freelance|contractor)\b/i;

const MAX_NAME_LINE_LENGTH = 60;
const MAX_NAME_WORDS = 4;

function looksLikePersonName(line: string): string | null {
  if (line.length > MAX_NAME_LINE_LENGTH) return null;
  if (line.includes("@")) return null;
  if (/\d/.test(line)) return null;
  if (NON_NAME_LINES.some((re) => re.test(line))) return null;
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > MAX_NAME_WORDS) return null;
  // Every word must look name-like (Title Case or ALL CAPS), and the line
  // must not contain job-title vocabulary ("Senior Software Engineer").
  if (TITLE_WORD_RE.test(line)) return null;
  for (const word of words) {
    // Strip common punctuation wrappers like "Cooper," or "J." or "(PhD)"
    const cleaned = word.replace(/^["'(]+|["'),.;:!?]+$/g, "");
    if (!NAME_WORD_RE.test(cleaned)) return null;
    // Reject words that are entirely lowercase (mid-sentence words).
    if (cleaned === cleaned.toLowerCase()) return null;
  }
  return words
    .map((w) =>
      w
        .replace(/^["'(]+/, "")
        .replace(/["'),.;:!?]+$/, "")
        .replace(/^([A-Za-z])(\.?)$/, "$1$2")
        .replace(/^./, (c) => c.toUpperCase()),
    )
    .filter(Boolean)
    .join(" ");
}

function extractNameFromLabel(lines: string[]): string | null {
  for (const line of lines.slice(0, 15)) {
    const match = line.match(NAME_LABEL_RE);
    if (match) {
      const candidate = (match[1] ?? "").trim();
      if (candidate.length > 0 && candidate.length <= MAX_NAME_LINE_LENGTH) {
        const cleaned = candidate
          .replace(/^["'(]+|["'),.;:!?]+$/g, "")
          .replace(/\s+/g, " ")
          .trim();
        const words = cleaned.split(" ").filter(Boolean);
        if (
          words.length >= 1 &&
          words.length <= MAX_NAME_WORDS &&
          !/\d/.test(cleaned) &&
          !cleaned.includes("@") &&
          !TITLE_WORD_RE.test(cleaned) &&
          words.every((w) => NAME_WORD_RE.test(w))
        ) {
          return cleaned;
        }
      }
    }
  }
  return null;
}

export function extractCandidateMeta(raw: string): DraftExtraction {
  const { text } = extractResumeText(raw ?? "");
  const emailMatch = text.match(EMAIL_RE);
  const email = emailMatch ? emailMatch[0].toLowerCase() : "";
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  // 1) Explicit label: "Name: Jane Cooper"
  let name = extractNameFromLabel(lines) ?? "";

  // 2) Conventional header: the first plausible 2-4 word person-name line
  //    within the first ~8 lines of the document.
  if (!name) {
    for (const line of lines.slice(0, 8)) {
      const guessed = looksLikePersonName(line);
      if (guessed) {
        name = guessed;
        break;
      }
    }
  }

  // 3) Broader fallback across the whole document (still title-filtered).
  if (!name) {
    for (const line of lines) {
      const guessed = looksLikePersonName(line);
      if (guessed) {
        name = guessed;
        break;
      }
    }
  }

  return { name, email, resumeText: text };
}

export function recommendRoles(
  resumeText: string,
  roles: RoleProfile[],
): RoleMatch[] {
  const hay = (resumeText ?? "").toLowerCase();
  const scored = roles.map((role) => {
    const reqHits = role.requirements.filter((req) =>
      hay.includes(req.toLowerCase()),
    );
    const niceHits = role.niceToHave.filter((req) =>
      hay.includes(req.toLowerCase()),
    );
    const titleHit = hay.includes(role.title.toLowerCase());
    const score = Math.min(
      100,
      reqHits.length * 22 + niceHits.length * 8 + (titleHit ? 12 : 0),
    );
    const reasons = [
      ...(titleHit ? [`resume mentions "${role.title}"`] : []),
      ...reqHits.slice(0, 4).map((req) => `requirement match: ${req}`),
      ...niceHits.slice(0, 2).map((req) => `nice-to-have: ${req}`),
    ].slice(0, 6);
    return {
      roleId: role.id,
      title: role.title,
      score: Number.isFinite(score) ? Math.round(score) : 0,
      reasons,
    };
  });
  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return scored;
}

export function extractCandidateFromDocument(
  documentText: string,
  roles: RoleProfile[],
): {
  extraction: DraftExtraction;
  recommendations: RoleMatch[];
} {
  const extraction = extractCandidateMeta(documentText);
  const recommendations = recommendRoles(extraction.resumeText, roles);
  return { extraction, recommendations };
}
