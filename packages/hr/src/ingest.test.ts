import { describe, expect, it } from "vitest";
import { createGateway, createFakeProvider } from "@dsrvm/ai";
import { HrService } from "./service.js";
import { createScreeningEngine } from "./screening.js";
import { createInMemoryStore } from "./store.js";
import { detectMapping, parseCsv, parseCandidatesCsv } from "./ingest/csv.js";
import { extractResumeText, detectPii } from "./ingest/resume.js";
import { parseEmail, parseEmailCandidate } from "./ingest/email.js";
import { CandidateIngestor } from "./ingest/service.js";

function buildIngestor() {
  const gateway = createGateway(
    [createFakeProvider({ name: "fake", echo: false, output: "{}" })],
    {
      activeProvider: "fake",
    },
  );
  const store = createInMemoryStore();
  const service = new HrService({
    store,
    screeningEngine: createScreeningEngine(gateway),
    now: () => new Date("2026-08-04T00:00:00.000Z"),
  });
  return { service, ingestor: new CandidateIngestor({ service }) };
}

describe("parseCsv", () => {
  it("parses simple csv with headers", () => {
    const rows = parseCsv("name,email,resume\nAda,ada@x.com,TS\n");
    expect(rows).toEqual([
      ["name", "email", "resume"],
      ["Ada", "ada@x.com", "TS"],
    ]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    const rows = parseCsv(
      'name,resume\nAda,"Go, Rust, TS"\nBob,"said ""hi"""\n',
    );
    expect(rows[1]).toEqual(["Ada", "Go, Rust, TS"]);
    expect(rows[2]).toEqual(["Bob", 'said "hi"']);
  });

  it("handles crlf line endings", () => {
    const rows = parseCsv("name,email\r\nAda,ada@x.com\r\n");
    expect(rows).toEqual([
      ["name", "email"],
      ["Ada", "ada@x.com"],
    ]);
  });
});

describe("detectMapping", () => {
  it("maps common ats headers case-insensitively", () => {
    const mapping = detectMapping([
      "Full Name",
      "Email Address",
      "Resume/CV Text",
    ]);
    expect(mapping).toEqual({
      name: "Full Name",
      email: "Email Address",
      resume: "Resume/CV Text",
    });
  });
});

describe("parseCandidatesCsv", () => {
  const CSV = [
    "Full Name,Email Address,Resume/CV Text,Candidate ID",
    'Ada Lovelace,ada@example.com,"Go, Rust, TS",A-1',
    "Grace Hopper,grace@example.com,Cobol,B-2",
    ",noemail@example.com,Missing name,C-3",
    "No Email,missing@example.com,,",
  ].join("\n");

  it("extracts candidates with auto-mapping", () => {
    const { candidates, errors } = parseCandidatesCsv(CSV);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@example.com",
      resumeText: "Go, Rust, TS",
      externalId: "A-1",
    });
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatchObject({ row: 4, error: "missing name" });
    expect(errors[1]).toMatchObject({ row: 5, error: "missing resume text" });
  });

  it("respects explicit mapping", () => {
    const { candidates } = parseCandidatesCsv("n,e,r\nAda,ada@x.com,TS", {
      mapping: { name: "n", email: "e", resume: "r" },
    });
    expect(candidates[0]).toMatchObject({
      name: "Ada",
      email: "ada@x.com",
      resumeText: "TS",
    });
  });
});

describe("extractResumeText", () => {
  it("collapses whitespace and strips markdown and links", () => {
    const { text } = extractResumeText(
      "# Ada Lovelace\n\n**Email:** [ada@example.com](mailto:ada@example.com)\n\n  TS   Dev   ",
    );
    expect(text).not.toContain("#");
    expect(text).not.toContain("**");
    expect(text).not.toContain("mailto");
    expect(text).toContain("ada@example.com");
    expect(text).not.toContain("  ");
  });

  it("detects pii categories", () => {
    const pii = detectPii(
      "Contact: ada@example.com, phone 07700 900123, NINO AB123456C, SW1A 1AA",
    );
    expect(pii).toContain("email");
    expect(pii).toContain("phone");
    expect(pii).toContain("national_insurance");
    expect(pii).toContain("postcode");
  });

  it("returns empty for blank input", () => {
    expect(extractResumeText("   ").text).toBe("");
    expect(extractResumeText("   ").pii).toEqual([]);
  });

  it("truncates to maxLength", () => {
    const { text } = extractResumeText("a".repeat(500), { maxLength: 50 });
    expect(text.length).toBeLessThanOrEqual(51);
  });
});

describe("parseEmail / parseEmailCandidate", () => {
  const RAW = [
    "From: Ada Lovelace <ada@example.com>",
    "To: jobs@dsrvm.app",
    "Subject: Application: Founding Engineer",
    "",
    "TypeScript and LLM pipelines for 8 years.",
    "",
    "Regards, Ada",
  ].join("\n");

  it("parses rfc822 headers and body", () => {
    const { from, subject, body } = parseEmail(RAW);
    expect(from).toBe("Ada Lovelace <ada@example.com>");
    expect(subject).toBe("Application: Founding Engineer");
    expect(body).toContain("TypeScript");
  });

  it("extracts candidate from email", () => {
    const candidate = parseEmailCandidate({
      raw: RAW,
      defaultRoleId: "role-1",
    });
    expect(candidate).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@example.com",
      roleId: "role-1",
      source: "email",
    });
    expect(candidate?.resumeText).toContain("TypeScript");
  });

  it("rejects email without name or body", () => {
    expect(
      parseEmailCandidate({ raw: "From: jobs@x.com\nSubject: hi\n\nbody" }),
    ).toBeNull();
    expect(
      parseEmailCandidate({ raw: "From: Ada <ada@x.com>\nSubject: hi\n\n" }),
    ).toBeNull();
  });
});

describe("CandidateIngestor", () => {
  it("imports csv candidates into the pipeline with dedupe", async () => {
    const { service } = buildIngestor();
    const role = await service.createRole({
      title: "Engineer",
      requirements: ["TS"],
    });
    const ingestor = new CandidateIngestor({ service, defaultRoleId: role.id });
    const csv = [
      "name,email,resume",
      "Ada,ada@example.com,TypeScript",
      "Grace,grace@example.com,Go",
      "Ada,ada@example.com,TypeScript again",
    ].join("\n");

    const result = await ingestor.importCsv(csv, {
      mapping: { name: "name", email: "email", resume: "resume" },
    });
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(1);

    const candidates = await service.listCandidates();
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.email)).toContain("ada@example.com");
    expect(candidates.map((c) => c.email)).toContain("grace@example.com");
  });

  it("imports email candidate", async () => {
    const { service, ingestor } = buildIngestor();
    const role = await service.createRole({
      title: "Engineer",
      requirements: ["TS"],
    });
    const raw = [
      "From: Alan Turing <alan@example.com>",
      "Subject: Application",
      "",
      "Cryptography and TypeScript.",
    ].join("\n");

    const result = await ingestor.importEmail({ raw, defaultRoleId: role.id });
    expect(result.imported).toBe(1);
    expect(await service.listCandidates()).toHaveLength(1);
  });

  it("returns error result for unparseable email", async () => {
    const { ingestor } = buildIngestor();
    const result = await ingestor.importEmail({ raw: "just some text" });
    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
  });
});
