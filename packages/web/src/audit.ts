import { randomUUID } from "node:crypto";
import type { AuditEvent, User } from "./types.js";
import type { WebStore } from "./store.js";
import { PERMISSIONS, requirePermission } from "./rbac.js";

export interface AuditService {
  record(input: {
    tenantId: string;
    actorId: string;
    action: string;
    detail?: string;
  }): Promise<AuditEvent>;
  list(input: { tenantId: string; actor: User }): Promise<AuditEvent[]>;
}

export function createAuditService(
  store: WebStore,
  now: () => Date = () => new Date(),
): AuditService {
  return {
    async record({ tenantId, actorId, action, detail }) {
      if ((await store.getTenant(tenantId)) === null) {
        throw new Error(`tenant "${tenantId}" not found`);
      }
      const event: AuditEvent = {
        id: randomUUID(),
        tenantId,
        actorId,
        action,
        detail,
        at: now().toISOString(),
      };
      await store.addAuditEvent(event);
      return event;
    },

    async list({ tenantId, actor }) {
      requirePermission(actor, PERMISSIONS.auditView);
      if (actor.tenantId !== tenantId) {
        throw new Error("cross-tenant read rejected");
      }
      return store.listAuditEvents(tenantId);
    },
  };
}
