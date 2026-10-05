import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { Session, User, UserRole } from "./types.js";
import type { WebStore } from "./store.js";
import { hashInviteToken } from "./invites.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const KEY_LENGTH = 64;

/** Roles that may self-register without an invite. Privileged roles require one. */
const OPEN_SIGNUP_ROLES: readonly UserRole[] = ["editor", "viewer"];

export interface AuthService {
  signup(input: {
    tenantId: string;
    email: string;
    password: string;
    name: string;
    role?: UserRole;
    inviteToken?: string;
  }): Promise<{ user: User; token: string }>;
  login(input: { tenantId: string; email: string; password: string }): Promise<{
    user: User;
    token: string;
  }>;
  ssoLogin(input: {
    tenantId: string;
    email: string;
    name: string;
    role?: UserRole;
  }): Promise<{ user: User; token: string; created: boolean }>;
  logout(token: string): Promise<void>;
  authenticate(token: string): Promise<Session | null>;
  getUser(session: Session): Promise<User | null>;
}

export function createAuthService(
  store: WebStore,
  now: () => Date = () => new Date(),
): AuthService {
  return {
    async signup({ tenantId, email, password, name, role, inviteToken }) {
      if ((await store.getTenant(tenantId)) === null) {
        throw new Error(`tenant "${tenantId}" not found`);
      }
      const normalized = email.trim().toLowerCase();
      if (await store.getUserByEmail(tenantId, normalized)) {
        throw new Error(`user "${normalized}" already exists in tenant`);
      }
      const requested: UserRole = role ?? "viewer";
      if (requested === "owner") {
        const users = await store.getUsersByTenant(tenantId);
        if (users.some((u) => u.role === "owner")) {
          throw new Error("tenant already has an owner");
        }
      }
      if (!OPEN_SIGNUP_ROLES.includes(requested)) {
        await consumeInviteForSignup(store, {
          tenantId,
          email: normalized,
          role: requested,
          inviteToken,
          now: now(),
        });
      }
      const user: User = {
        id: randomUUID(),
        tenantId,
        email: normalized,
        passwordHash: hashPassword(password),
        name,
        role: requested,
        createdAt: now().toISOString(),
      };
      await store.saveUser(user);
      const session = await createSession(store, user, now);
      return { user, token: session.token };
    },

    async login({ tenantId, email, password }) {
      const user = await store.getUserByEmail(tenantId, email);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        throw new Error("invalid credentials");
      }
      const session = await createSession(store, user, now);
      return { user, token: session.token };
    },

    async ssoLogin({ tenantId, email, name, role }) {
      if ((await store.getTenant(tenantId)) === null) {
        throw new Error(`tenant "${tenantId}" not found`);
      }
      const normalized = email.trim().toLowerCase();
      const existing = await store.getUserByEmail(tenantId, normalized);
      let user: User;
      let created = false;
      if (!existing) {
        created = true;
        const assigned = await clampSsoRole(store, tenantId, role ?? "viewer");
        user = {
          id: randomUUID(),
          tenantId,
          email: normalized,
          passwordHash: "",
          name,
          role: assigned,
          createdAt: now().toISOString(),
        };
        await store.saveUser(user);
      } else {
        if (!role || role === existing.role) {
          user = existing;
        } else if (existing.role === "owner") {
          // SSO group mappings must never demote or override a tenant owner.
          user = existing;
        } else {
          const clamped = await clampSsoRole(store, tenantId, role);
          user =
            clamped === existing.role
              ? existing
              : { ...existing, role: clamped };
          if (user !== existing) await store.saveUser(user);
        }
      }
      const session = await createSession(store, user, now);
      return { user, token: session.token, created };
    },

    async logout(token) {
      await store.deleteSession(token);
    },

    async authenticate(token) {
      const session = await store.getSession(token);
      if (!session) return null;
      if (Date.parse(session.expiresAt) <= now().getTime()) {
        await store.deleteSession(token);
        return null;
      }
      return session;
    },

    async getUser(session) {
      return store.getUser(session.userId);
    },
  };
}

async function createSession(
  store: WebStore,
  user: User,
  now: () => Date,
): Promise<Session> {
  const session: Session = {
    token: randomBytes(24).toString("base64url"),
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    expiresAt: new Date(now().getTime() + SESSION_TTL_MS).toISOString(),
    createdAt: now().toISOString(),
  };
  await store.saveSession(session);
  return session;
}

async function consumeInviteForSignup(
  store: WebStore,
  input: {
    tenantId: string;
    email: string;
    role: UserRole;
    inviteToken: string | undefined;
    now: Date;
  },
): Promise<void> {
  if (!input.inviteToken) {
    throw new Error(
      `role "${input.role}" requires an invite (request one from an owner, admin, or operator)`,
    );
  }
  const invite = await store.getInviteByTokenHash(
    hashInviteToken(input.inviteToken),
  );
  if (
    !invite ||
    invite.tenantId !== input.tenantId ||
    invite.email.toLowerCase() !== input.email.toLowerCase() ||
    invite.role !== input.role
  ) {
    throw new Error("invalid invite for this tenant, email, and role");
  }
  if (Date.parse(invite.expiresAt) <= input.now.getTime()) {
    await store.deleteInvite(invite.id);
    throw new Error("invite expired");
  }
  await store.deleteInvite(invite.id);
}

/**
 * SSO-provisioned roles can never mint a second owner: when the tenant
 * already has an owner, a mapped "owner" role is clamped to "admin".
 */
async function clampSsoRole(
  store: WebStore,
  tenantId: string,
  role: UserRole,
): Promise<UserRole> {
  if (role !== "owner") return role;
  const users = await store.getUsersByTenant(tenantId);
  if (users.some((u) => u.role === "owner")) return "admin";
  return "owner";
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, derived] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !derived) return false;
  const candidate = scryptSync(password, salt, KEY_LENGTH);
  const expected = Buffer.from(derived, "hex");
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}
