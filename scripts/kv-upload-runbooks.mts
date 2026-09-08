import { writeFileSync } from "node:fs";
import { join } from "node:path";

const ONBOARDING_RUNBOOKS: Record<string, string> = {
  "runbook/candidate-intake":
    "# Candidate Intake Runbook\n\n" +
    "## Steps\n" +
    "1. Create a role profile via POST /api/roles\n" +
    "2. Import candidates via CSV or email via POST /api/candidates/import/csv or /api/candidates/import/email\n" +
    "3. Candidates are automatically screened by AI\n" +
    "4. Review the review queue at GET /api/candidates?status=pending_review\n" +
    "5. Approve or reject via POST /api/candidates/:id/review\n" +
    "6. Audit trail at GET /api/audit\n",

  "runbook/screening":
    "# Screening Runbook\n\n" +
    "## How AI Screening Works\n" +
    "- Candidate resumes are matched against role requirements\n" +
    "- Score 0-100, recommendation: advance/reject/needs_review\n" +
    "- Bias gate runs on synthetic cohorts (4/5ths rule, Cohen d, Mann-Whitney U)\n" +
    "- Human reviewer always makes the final decision\n",

  "runbook/compliance":
    "# Compliance Runbook\n\n" +
    "## AI Notice (DSRA-27)\n" +
    "- Every candidate receives AI transparency notice\n" +
    "- Candidates can request human-only review\n" +
    "- Notice disclosure is tracked in audit log\n\n" +
    "## Data Retention (G6)\n" +
    "- Candidates: 6 months after decision\n" +
    "- Audit logs: 2 years (anonymized)\n" +
    "- Outbox events: 90 days\n" +
    "- Dispute-held candidates are exempt from deletion\n\n" +
    "## Dispute Resolution\n" +
    "- POST /api/candidates/:id/dispute to raise\n" +
    "- POST /api/candidates/:id/dispute/resolve to resolve\n",
};

async function uploadRunbooks() {
  const namespaceId = process.env.KV_RUNBOOKS_ID;
  if (!namespaceId) {
    console.log("KV_RUNBOOKS_ID not set; generating runbook files locally instead");
    const outDir = join(process.cwd(), "dist", "runbooks");
    for (const [key, value] of Object.entries(ONBOARDING_RUNBOOKS)) {
      const filename = key.replace(/\//g, "_") + ".md";
      writeFileSync(join(outDir, filename), value, "utf-8");
      console.log(`  wrote ${filename}`);
    }
    console.log(`Generated ${Object.keys(ONBOARDING_RUNBOOKS).length} runbook files in ${outDir}`);
    return;
  }

  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!apiToken || !accountId) {
    throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID required for KV upload");
  }

  for (const [key, value] of Object.entries(ONBOARDING_RUNBOOKS)) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "text/plain",
      },
      body: value,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`KV upload failed for ${key}: ${res.status} ${body}`);
    }
    console.log(`  uploaded ${key}`);
  }

  console.log(`Uploaded ${Object.keys(ONBOARDING_RUNBOOKS).length} runbooks to KV namespace ${namespaceId}`);
}

uploadRunbooks().catch((err) => {
  console.error("Failed to upload runbooks:", err);
  process.exit(1);
});
