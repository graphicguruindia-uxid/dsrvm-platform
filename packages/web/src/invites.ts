import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Invite, User, UserRole } from "./types.js";
import type { WebStore } from "./store.js";
import {
  PERMISSIONS,
  invitableRoles,
  requireCanInvite,
  requirePermission,
} from "./rbac.js";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PublicInvite {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  expiresAt: string;
  createdBy: string;
  createdAt: string;
}

export interface InviteService {
  create(input: {
    tenantId: string;
    email: string;
    role: UserRole;
    actor: User;
  }): Promise<{ invite: PublicInvite; token: string }>;
  accept(input: {
    token: string;
    name: string;
    password: string;
  }): Promise<{ user: User; sessionToken: string }>;
  list(input: { tenantId: string; actor: User }): Promise<PublicInvite[]>;
  revoke(input: { tenantId: string; id: string; actor: User }): Promise<void>;
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function toPublicInvite(invite: Invite): PublicInvite {
  return {
    id: invite.id,
    tenantId: invite.tenantId,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
    createdBy: invite.createdBy,
    createdAt: invite.createdAt,
  };
}

export function createInviteService(
  store: WebStore,
  deps: {
    createUser: (input: {
      tenantId: string;
      email: string;
      password: string;
      name: string;
      role: UserRole;
      inviteToken?: string;
    }) => Promise<{ user: User; token: string }>;
    recordAudit: (input: {
      tenantId: string;
      actorId: string;
      action: string;
      detail?: string;
    }) => Promise<void>;
    now?: () => Date;
  },
): InviteService {
  const now = deps.now ?? (() => new Date());

  async function assertSingleOwner(tenantId: string, role: UserRole) {
    if (role !== "owner") return;
    const users = await store.getUsersByTenant(tenantId);
    if (users.some((u) => u.role === "owner")) {
      throw new Error("tenant already has an owner");
    }
  }

  return {
    async create({ tenantId, email, role, actor }) {
      requirePermission(actor, PERMISSIONS.inviteManage);
      if (actor.tenantId !== tenantId) {
        throw new Error("cross-tenant invite rejected");
      }
      requireCanInvite(actor.email, actor.role, role);
      if ((await store.getTenant(tenantId)) === null) {
        throw new Error(`tenant "${tenantId}" not found`);
      }
      await assertSingleOwner(tenantId, role);
      const normalized = email.trim().toLowerCase();
      if (await store.getUserByEmail(tenantId, normalized)) {
        throw new Error(`user "${normalized}" already exists in tenant`);
      }
      const existing = await store.listInvitesByTenant(tenantId);
      if (
        existing.some(
          (i) => i.email.toLowerCase() === normalized && !isExpired(i, now()),
        )
      ) {
        throw new Error(`invite for "${normalized}" already pending`);
      }
      const token = randomBytes(32).toString("base64url");
      const invite: Invite = {
        id: randomUUID(),
        tenantId,
        email: normalized,
        role,
        tokenHash: hashInviteToken(token),
        expiresAt: new Date(now().getTime() + INVITE_TTL_MS).toISOString(),
        createdBy: actor.id,
        createdAt: now().toISOString(),
      };
      await store.saveInvite(invite);
      await deps.recordAudit({
        tenantId,
        actorId: actor.id,
        action: "invite.create",
        detail: `${normalized} as ${role}`,
      });
      return { invite: toPublicInvite(invite), token };
    },

    async accept({ token, name, password }) {
      const invite = await store.getInviteByTokenHash(hashInviteToken(token));
      if (!invite) {
        throw new Error("invalid or unknown invite token");
      }
      if (isExpired(invite, now())) {
        await store.deleteInvite(invite.id);
        throw new Error("invite expired");
      }
      if ((await store.getTenant(invite.tenantId)) === null) {
        throw new Error(`tenant "${invite.tenantId}" not found`);
      }
      if (await store.getUserByEmail(invite.tenantId, invite.email)) {
        await store.deleteInvite(invite.id);
        throw new Error(`user "${invite.email}" already exists in tenant`);
      }
      await assertSingleOwner(invite.tenantId, invite.role);
      const { user, token: sessionToken } = await deps.createUser({
        tenantId: invite.tenantId,
        email: invite.email,
        password,
        name,
        role: invite.role,
        inviteToken: token,
      });
      await store.deleteInvite(invite.id);
      await deps.recordAudit({
        tenantId: invite.tenantId,
        actorId: user.id,
        action: "invite.accept",
        detail: `${user.email} as ${user.role}`,
      });
      return { user, sessionToken };
    },

    async list({ tenantId, actor }) {
      requirePermission(actor, PERMISSIONS.inviteManage);
      if (actor.tenantId !== tenantId) {
        throw new Error("cross-tenant read rejected");
      }
      const invites = await store.listInvitesByTenant(tenantId);
      return invites.map(toPublicInvite);
    },

    async revoke({ tenantId, id, actor }) {
      requirePermission(actor, PERMISSIONS.inviteManage);
      if (actor.tenantId !== tenantId) {
        throw new Error("cross-tenant revoke rejected");
      }
      const invite = await store.getInvite(id);
      if (!invite || invite.tenantId !== tenantId) {
        throw new Error("invite not found");
      }
      await store.deleteInvite(id);
      await deps.recordAudit({
        tenantId,
        actorId: actor.id,
        action: "invite.revoke",
        detail: `${invite.email} as ${invite.role}`,
      });
    },
  };
}

function isExpired(invite: Invite, at: Date): boolean {
  return Date.parse(invite.expiresAt) <= at.getTime();
}

export { invitableRoles };
