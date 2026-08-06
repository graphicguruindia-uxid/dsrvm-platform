export interface DbConfig {
  url: string;
}

export interface DbClient {
  healthCheck(): Promise<{ connected: boolean }>;
}

export function createDbClient(config: DbConfig): DbClient {
  return {
    async healthCheck() {
      return { connected: config.url.length > 0 };
    },
  };
}
