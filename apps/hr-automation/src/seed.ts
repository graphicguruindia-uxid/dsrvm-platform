import type { HrService } from "@dsrvm/hr";

export interface SeedResult {
  roleId: string;
  candidateIds: string[];
}

const DEMO_CANDIDATES = [
  {
    name: "Ada Lovelace",
    email: "ada.lovelace@example.com",
    resumeText:
      "Analytical engine pioneer. 10 years building numerical computation systems. Strong TypeScript, Python, and mathematical modelling. Led design of a general-purpose computing platform used by analysts worldwide.",
  },
  {
    name: "Alan Turing",
    email: "alan.turing@example.com",
    resumeText:
      "Computer scientist focused on machine intelligence. Built early pattern-matching and code-breaking systems. Deep experience in logic, algorithms, and formal verification. Comfortable across Node.js and Go.",
  },
  {
    name: "Grace Hopper",
    email: "grace.hopper@example.com",
    resumeText:
      "Compiler pioneer with 15 years shipping developer tooling. Expert in language design, test suites, and onboarding large engineering teams. Prefers writing documentation before code.",
  },
  {
    name: "Margaret Hamilton",
    email: "margaret.hamilton@example.com",
    resumeText:
      "Systems architect who led mission-critical software delivery. Specialises in fault-tolerant systems, Postgres, and observability. Strong track record of hiring and mentoring junior engineers.",
  },
];

export async function seedDemo(hr: HrService): Promise<SeedResult> {
  const role = await hr.createRole({
    title: "Founding Engineer",
    requirements: ["TypeScript", "Node.js", "Postgres", "AI/LLM integration"],
    niceToHave: ["AWS", "Docker", "React"],
  });

  const candidateIds: string[] = [];
  for (const demo of DEMO_CANDIDATES) {
    const candidate = await hr.createCandidate({
      roleId: role.id,
      name: demo.name,
      email: demo.email,
      resumeText: demo.resumeText,
    });
    await hr.screenCandidate(candidate.id);
    candidateIds.push(candidate.id);
  }

  return { roleId: role.id, candidateIds };
}
