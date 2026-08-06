import { randomUUID } from "node:crypto";
import type { ContentItem, ContentStatus, User } from "./types.js";
import { PERMISSIONS, requirePermission } from "./rbac.js";
import type { WebStore } from "./store.js";

export interface CmsService {
  createItem(input: {
    tenantId: string;
    slug: string;
    title: string;
    body: string;
    actor: User;
  }): Promise<ContentItem>;
  updateItem(input: {
    tenantId: string;
    id: string;
    title?: string;
    body?: string;
    actor: User;
  }): Promise<ContentItem>;
  setStatus(input: {
    tenantId: string;
    id: string;
    status: ContentStatus;
    actor: User;
  }): Promise<ContentItem>;
  getBySlug(tenantId: string, slug: string): Promise<ContentItem | null>;
  list(tenantId: string, status?: ContentStatus): Promise<ContentItem[]>;
}

export function createCmsService(
  store: WebStore,
  now: () => Date = () => new Date(),
): CmsService {
  return {
    async createItem({ tenantId, slug, title, body, actor }) {
      requirePermission(actor, PERMISSIONS.cmsEdit);
      if (actor.tenantId !== tenantId) {
        throw new Error("cross-tenant write rejected");
      }
      if (await store.getContentBySlug(tenantId, slug)) {
        throw new Error(`slug "${slug}" already exists`);
      }
      const item: ContentItem = {
        id: randomUUID(),
        tenantId,
        slug,
        title,
        body,
        status: "draft",
        publishedAt: null,
        updatedBy: actor.id,
        updatedAt: now().toISOString(),
        createdAt: now().toISOString(),
      };
      await store.saveContent(item);
      return item;
    },

    async updateItem({ tenantId, id, title, body, actor }) {
      requirePermission(actor, PERMISSIONS.cmsEdit);
      if (actor.tenantId !== tenantId) {
        throw new Error("cross-tenant write rejected");
      }
      const existing = await store.getContent(id);
      if (!existing || existing.tenantId !== tenantId) {
        throw new Error("content not found");
      }
      const updated: ContentItem = {
        ...existing,
        title: title ?? existing.title,
        body: body ?? existing.body,
        updatedBy: actor.id,
        updatedAt: now().toISOString(),
      };
      await store.saveContent(updated);
      return updated;
    },

    async setStatus({ tenantId, id, status, actor }) {
      requirePermission(actor, PERMISSIONS.cmsPublish);
      if (actor.tenantId !== tenantId) {
        throw new Error("cross-tenant write rejected");
      }
      const existing = await store.getContent(id);
      if (!existing || existing.tenantId !== tenantId) {
        throw new Error("content not found");
      }
      const updated: ContentItem = {
        ...existing,
        status,
        publishedAt:
          status === "published"
            ? (existing.publishedAt ?? now().toISOString())
            : existing.publishedAt,
        updatedBy: actor.id,
        updatedAt: now().toISOString(),
      };
      await store.saveContent(updated);
      return updated;
    },

    async getBySlug(tenantId, slug) {
      const item = await store.getContentBySlug(tenantId, slug);
      if (item && item.status !== "published") return null;
      return item;
    },

    async list(tenantId, status) {
      const items = await store.listContentByTenant(tenantId);
      return status ? items.filter((i) => i.status === status) : items;
    },
  };
}
