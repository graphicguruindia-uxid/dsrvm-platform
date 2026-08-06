import type {
  ParsedCandidate,
  CsvColumnMapping,
  CsvImportOptions,
  ImportError,
} from "./types.js";

export interface CsvRow {
  index: number;
  values: Record<string, string>;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") {
    rows.push(row);
  }
  return rows;
}

const COMMON_MAPPING: Record<string, keyof CsvColumnMapping> = {
  name: "name",
  fullname: "name",
  "full name": "name",
  candidate: "name",
  "candidate name": "name",
  email: "email",
  "email address": "email",
  "e-mail": "email",
  resume: "resume",
  "resume text": "resume",
  cv: "resume",
  "cv text": "resume",
  "resume/cv": "resume",
  "resume/cv text": "resume",
  resume_text: "resume",
  id: "externalId",
  "candidate id": "externalId",
  "external id": "externalId",
  applicantid: "externalId",
  "applicant id": "externalId",
  roleid: "roleId",
  "role id": "roleId",
  role: "roleId",
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

export function detectMapping(headers: string[]): CsvColumnMapping {
  const mapping: CsvColumnMapping = {};
  for (const header of headers) {
    const key = COMMON_MAPPING[normalizeHeader(header)];
    if (key && !mapping[key]) {
      mapping[key] = header;
    }
  }
  return mapping;
}

export function parseCandidatesCsv(
  text: string,
  options: CsvImportOptions = {},
): { candidates: ParsedCandidate[]; errors: ImportError[] } {
  const rows = parseCsv(text);
  const errors: ImportError[] = [];
  const candidates: ParsedCandidate[] = [];

  if (rows.length === 0) {
    return { candidates, errors: [{ row: 0, error: "empty csv" }] };
  }

  const headerRow = options.headerRow ?? true;
  let headers: string[];
  let dataRows: string[][];
  if (headerRow) {
    headers = rows[0]!.map((header) => header.trim());
    dataRows = rows.slice(1);
  } else {
    headers = [];
    dataRows = rows;
  }

  const mapping =
    options.mapping ?? (headers.length > 0 ? detectMapping(headers) : {});
  const colIndex = (key: keyof CsvColumnMapping): number | null => {
    const header = mapping[key];
    if (!header) return null;
    const idx = headers.findIndex((h) => h === header);
    return idx >= 0 ? idx : null;
  };

  const nameIdx = colIndex("name");
  const emailIdx = colIndex("email");
  const resumeIdx = colIndex("resume");
  const externalIdx = colIndex("externalId");
  const roleIdx = colIndex("roleId");

  dataRows.forEach((values, offset) => {
    const rowNumber = offset + 2;
    const get = (idx: number | null): string =>
      idx !== null && idx < values.length ? values[idx]!.trim() : "";

    const email = get(emailIdx);
    const name = get(nameIdx);
    const resumeText = get(resumeIdx);

    if (!email) {
      errors.push({ row: rowNumber, error: "missing email" });
      return;
    }
    if (!name) {
      errors.push({ row: rowNumber, error: "missing name" });
      return;
    }
    if (!resumeText) {
      errors.push({ row: rowNumber, error: "missing resume text" });
      return;
    }

    const externalId = get(externalIdx);
    const roleId = get(roleIdx);
    const candidate: ParsedCandidate = {
      name,
      email,
      resumeText,
      source: "csv",
    };
    if (externalId) candidate.externalId = externalId;
    if (roleId) candidate.roleId = roleId;
    candidates.push(candidate);
  });

  return { candidates, errors };
}
