import type { User, UserRole } from "./types.js";

export const PERMISSIONS = {
  cmsView: "cms.view",
  cmsEdit: "cms.edit",
  cmsPublish: "cms.publish",
  userManage: "user.manage",
  billingView: "billing.view",
  billingManage: "billing.manage",
  tenantManage: "tenant.manage",
  consoleAccess: "console.access",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ROLE_MATRIX: Record<UserRole, readonly Permission[]> = {
  owner: [
    PERMISSIONS.cmsView,
    PERMISSIONS.cmsEdit,
    PERMISSIONS.cmsPublish,
    PERMISSIONS.userManage,
    PERMISSIONS.billingView,
    PERMISSIONS.billingManage,
    PERMISSIONS.tenantManage,
    PERMISSIONS.consoleAccess,
  ],
  admin: [
    PERMISSIONS.cmsView,
    PERMISSIONS.cmsEdit,
    PERMISSIONS.cmsPublish,
    PERMISSIONS.userManage,
    PERMISSIONS.billingView,
    PERMISSIONS.consoleAccess,
  ],
  editor: [
    PERMISSIONS.cmsView,
    PERMISSIONS.cmsEdit,
    PERMISSIONS.cmsPublish,
    PERMISSIONS.consoleAccess,
  ],
  viewer: [PERMISSIONS.cmsView],
};

export function permissionsFor(role: UserRole): readonly Permission[] {
  return ROLE_MATRIX[role] ?? [];
}

export function can(user: User, permission: Permission): boolean {
  return permissionsFor(user.role).includes(permission);
}

export function requirePermission(user: User, permission: Permission): void {
  if (!can(user, permission)) {
    throw new Error(
      `forbidden: user "${user.email}" (${user.role}) lacks "${permission}"`,
    );
  }
}
