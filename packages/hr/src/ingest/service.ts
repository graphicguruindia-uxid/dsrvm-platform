import type { HrService } from "../service.js";
import { parseCandidatesCsv } from "./csv.js";
import { parseEmailCandidate } from "./email.js";
import { extractResumeText } from "./resume.js";
import type {
  CsvImportOptions,
  EmailCandidateInput,
  ImportResult,
  ParsedCandidate,
} from "./types.js";

export interface CandidateIngestorOptions {
  service: HrService;
  defaultRoleId?: string;
}

export class CandidateIngestor {
  private readonly service: HrService;
  readonly defaultRoleId: string | undefined;

  constructor(options: CandidateIngestorOptions) {
    this.service = options.service;
    this.defaultRoleId = options.defaultRoleId;
  }

  withDefaultRoleId(defaultRoleId: string | undefined): CandidateIngestor {
    return new CandidateIngestor({
      service: this.service,
      defaultRoleId: defaultRoleId ?? this.defaultRoleId,
    });
  }

  async importCsv(
    text: string,
    options: CsvImportOptions = {},
  ): Promise<ImportResult> {
    const { candidates, errors } = parseCandidatesCsv(text, options);
    const imported = await this.importCandidates(candidates);
    return {
      parsed: candidates,
      imported: imported.imported,
      skipped: imported.skipped,
      errors: [...errors, ...imported.errors],
    };
  }

  async importEmail(input: EmailCandidateInput): Promise<ImportResult> {
    const candidate = parseEmailCandidate({
      ...input,
      defaultRoleId: input.defaultRoleId ?? this.defaultRoleId,
    });
    if (!candidate) {
      return {
        parsed: [],
        imported: 0,
        skipped: 0,
        errors: [{ row: 0, error: "unable to parse email into candidate" }],
      };
    }
    const imported = await this.importCandidates([candidate]);
    return {
      parsed: [candidate],
      imported: imported.imported,
      skipped: imported.skipped,
      errors: imported.errors,
    };
  }

  async importCandidates(candidates: ParsedCandidate[]): Promise<{
    imported: number;
    skipped: number;
    errors: { row: number; error: string }[];
  }> {
    let imported = 0;
    let skipped = 0;
    const errors: { row: number; error: string }[] = [];
    const seenEmails = new Set<string>();
    const existing = await this.service.listCandidates();

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]!;
      const email = candidate.email.toLowerCase().trim();
      if (
        seenEmails.has(email) ||
        existing.some((c) => c.email.toLowerCase().trim() === email)
      ) {
        skipped += 1;
        continue;
      }
      const roleId = candidate.roleId ?? this.defaultRoleId;
      if (!roleId) {
        errors.push({
          row: index + 1,
          error: `missing roleId for "${candidate.email}"`,
        });
        skipped += 1;
        continue;
      }
      const resume = extractResumeText(candidate.resumeText);
      try {
        await this.service.createCandidate({
          roleId,
          name: candidate.name,
          email: candidate.email,
          resumeText: resume.text,
        });
        seenEmails.add(email);
        imported += 1;
      } catch (error) {
        errors.push({
          row: index + 1,
          error: error instanceof Error ? error.message : String(error),
        });
        skipped += 1;
      }
    }
    return { imported, skipped, errors };
  }
}
