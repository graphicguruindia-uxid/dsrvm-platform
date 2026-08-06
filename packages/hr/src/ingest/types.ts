export type CandidateSource = "csv" | "email" | "manual";

export interface ParsedCandidate {
  name: string;
  email: string;
  resumeText: string;
  source: CandidateSource;
  externalId?: string;
  roleId?: string;
}

export interface CsvColumnMapping {
  name?: string;
  email?: string;
  resume?: string;
  externalId?: string;
  roleId?: string;
}

export interface CsvImportOptions {
  mapping?: CsvColumnMapping;
  headerRow?: boolean;
}

export interface ImportError {
  row: number;
  error: string;
}

export interface ImportResult {
  parsed: ParsedCandidate[];
  imported: number;
  skipped: number;
  errors: ImportError[];
}

export interface EmailCandidateInput {
  raw: string;
  defaultRoleId?: string;
}

export interface ExtractedResume {
  text: string;
  pii: string[];
}

export interface ResumeExtractionOptions {
  maxLength?: number;
}
