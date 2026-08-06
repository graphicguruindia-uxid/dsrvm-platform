import {
  createPostgresWebStore,
  createWebReferenceService,
  createWebStore,
} from "@dsrvm/web";
import type { SsoProviderConfig, WebReferenceService } from "@dsrvm/web";
import type { WebStore } from "@dsrvm/web";
import { buildWebReferenceServer, type WebReferenceServer } from "./server.js";

export interface WebReferenceAppOptions {
  now?: () => Date;
  databaseUrl?: string;
  ssoProviders?: SsoProviderConfig[];
  billingWebhookSecret?: string;
}

export interface WebReferenceApp extends WebReferenceServer {
  service: WebReferenceService;
  store: WebStore;
  close: () => Promise<void>;
}

export function createWebReferenceApp(
  options: WebReferenceAppOptions = {},
): WebReferenceApp {
  const now = options.now ?? (() => new Date());
  const { store, closeStore } = buildStore(options, now);
  const service = createWebReferenceService(store, {
    now,
    ssoProviders: options.ssoProviders ?? [],
    billingWebhookSecret: options.billingWebhookSecret,
  });
  const { server } = buildWebReferenceServer(service);
  return {
    server,
    service,
    store,
    close: async () => {
      await closeStore();
      await server.close();
    },
  };
}

function buildStore(
  options: WebReferenceAppOptions,
  now: () => Date,
): {
  store: WebStore;
  closeStore: () => Promise<void>;
} {
  if (options.databaseUrl) {
    const handle = createPostgresWebStore(options.databaseUrl);
    return { store: handle.store, closeStore: handle.close };
  }
  return { store: createWebStore(now), closeStore: async () => {} };
}
