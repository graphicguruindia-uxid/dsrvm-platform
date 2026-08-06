import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { Session, User, UserRole } from "./types.js";
import type { WebStore } from "./store.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const KEY_LENGTH = 64;

export interface AuthService {
  signup(input: {
    tenantId: string;
    email: string;
    password: string;
    name: string;
    role?: UserRole;
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
    async signup({ tenantId, email, password, name, role }) {
      if ((await store.getTenant(tenantId)) === null) {
        throw new Error(`tenant "${tenantId}" not found`);
      }
      if (await store.getUserByEmail(tenantId, email)) {
        throw new Error(`user "${email}" already exists in tenant`);
      }
      const user: User = {
        id: randomUUID(),
        tenantId,
        email: email.trim().toLowerCase(),
        passwordHash: hashPassword(password),
        name,
        role: role ?? "viewer",
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
        user = {
          id: randomUUID(),
          tenantId,
          email: normalized,
          passwordHash: "",
          name,
          role: role ?? "viewer",
          createdAt: now().toISOString(),
        };
        await store.saveUser(user);
      } else {
        user =
          role && role !== existing.role ? { ...existing, role } : existing;
        if (role && role !== existing.role) await store.saveUser(user);
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
