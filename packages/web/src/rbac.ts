import type { User, UserRole } from "./types.js";

export const PERMISSIONS = {
  cmsView: "cms.view",
  cmsEdit: "cms.edit",
  cmsPublish: "cms.publish",
  cmsIntegrate: "cms.integrate",
  aiIntegrate: "ai.integrate",
  userManage: "user.manage",
  inviteManage: "invite.manage",
  billingView: "billing.view",
  billingManage: "billing.manage",
  tenantManage: "tenant.manage",
  tenantDelete: "tenant.delete",
  consoleAccess: "console.access",
  reportsView: "reports.view",
  auditView: "audit.view",
  complianceView: "compliance.view",
  complianceManage: "compliance.manage",
  settingsManage: "settings.manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ROLE_MATRIX: Record<UserRole, readonly Permission[]> = {
  owner: [
    PERMISSIONS.cmsView,
    PERMISSIONS.cmsEdit,
    PERMISSIONS.cmsPublish,
    PERMISSIONS.cmsIntegrate,
    PERMISSIONS.aiIntegrate,
    PERMISSIONS.userManage,
    PERMISSIONS.inviteManage,
    PERMISSIONS.billingView,
    PERMISSIONS.billingManage,
    PERMISSIONS.tenantManage,
    PERMISSIONS.tenantDelete,
    PERMISSIONS.consoleAccess,
    PERMISSIONS.reportsView,
    PERMISSIONS.auditView,
    PERMISSIONS.complianceView,
    PERMISSIONS.complianceManage,
    PERMISSIONS.settingsManage,
  ],
  admin: [
    PERMISSIONS.cmsView,
    PERMISSIONS.cmsEdit,
    PERMISSIONS.cmsPublish,
    PERMISSIONS.cmsIntegrate,
    PERMISSIONS.aiIntegrate,
    PERMISSIONS.userManage,
    PERMISSIONS.inviteManage,
    PERMISSIONS.billingView,
    PERMISSIONS.billingManage,
    PERMISSIONS.tenantManage,
    PERMISSIONS.consoleAccess,
    PERMISSIONS.reportsView,
    PERMISSIONS.auditView,
    PERMISSIONS.complianceView,
    PERMISSIONS.complianceManage,
    PERMISSIONS.settingsManage,
  ],
  operator: [
    PERMISSIONS.cmsView,
    PERMISSIONS.cmsEdit,
    PERMISSIONS.cmsPublish,
    PERMISSIONS.cmsIntegrate,
    PERMISSIONS.aiIntegrate,
    PERMISSIONS.inviteManage,
    PERMISSIONS.billingView,
    PERMISSIONS.reportsView,
    PERMISSIONS.auditView,
    PERMISSIONS.complianceView,
  ],
  editor: [
    PERMISSIONS.cmsView,
    PERMISSIONS.cmsEdit,
    PERMISSIONS.cmsPublish,
    PERMISSIONS.cmsIntegrate,
    PERMISSIONS.reportsView,
  ],
  viewer: [PERMISSIONS.cmsView, PERMISSIONS.reportsView],
};

/** Rank order: owner > admin > operator > editor > viewer. */
export const ROLE_RANK: Record<UserRole, number> = {
  owner: 4,
  admin: 3,
  operator: 2,
  editor: 1,
  viewer: 0,
};

/**
 * Invite bounds (option a — strictly downward, no escalation):
 * - owner may invite admin | operator | editor | viewer (never a second owner)
 * - admin may invite operator | editor | viewer
 * - operator may invite editor | viewer only
 * - editor / viewer may not invite
 */
const INVITABLE: Record<UserRole, readonly UserRole[]> = {
  owner: ["admin", "operator", "editor", "viewer"],
  admin: ["operator", "editor", "viewer"],
  operator: ["editor", "viewer"],
  editor: [],
  viewer: [],
};

export function invitableRoles(role: UserRole): readonly UserRole[] {
  return INVITABLE[role] ?? [];
}

export function canInvite(
  inviterRole: UserRole,
  targetRole: UserRole,
): boolean {
  return invitableRoles(inviterRole).includes(targetRole);
}

export function requireCanInvite(
  inviterEmail: string,
  inviterRole: UserRole,
  targetRole: UserRole,
): void {
  if (!canInvite(inviterRole, targetRole)) {
    throw new Error(
      `forbidden: "${inviterRole}" (${inviterEmail}) cannot invite role "${targetRole}"`,
    );
  }
}

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
