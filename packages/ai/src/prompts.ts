export interface PromptTemplate {
  key: string;
  version: number;
  template: string;
  description?: string;
}

export function definePrompt(input: PromptTemplate): PromptTemplate {
  return Object.freeze({ ...input });
}

export function renderPrompt(
  template: Pick<PromptTemplate, "template">,
  variables: Record<string, string>,
): string {
  return template.template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = variables[name];
    if (value === undefined) {
      throw new Error(`renderPrompt: missing variable "${name}"`);
    }
    return value;
  });
}

export class PromptRegistry {
  private readonly byKey = new Map<string, PromptTemplate[]>();

  register(template: PromptTemplate): void {
    const versions = this.byKey.get(template.key) ?? [];
    versions.push(template);
    this.byKey.set(template.key, versions);
  }

  get(key: string, version?: number): PromptTemplate {
    const versions = this.byKey.get(key);
    if (!versions || versions.length === 0) {
      throw new Error(`PromptRegistry: no prompt registered for "${key}"`);
    }
    if (version !== undefined) {
      const found = versions.find((candidate) => candidate.version === version);
      if (!found) {
        throw new Error(
          `PromptRegistry: prompt "${key}" version ${version} not found`,
        );
      }
      return found;
    }
    return versions[versions.length - 1]!;
  }

  latest(key: string): PromptTemplate {
    return this.get(key);
  }

  list(): PromptTemplate[] {
    return [...this.byKey.values()].flat();
  }
}
