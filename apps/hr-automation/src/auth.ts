import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export interface AuthOptions {
  token?: string;
}

export function resolveAuthToken(): string | undefined {
  return process.env.HR_API_TOKEN ?? process.env.API_TOKEN ?? undefined;
}

export async function registerAuth(
  server: FastifyInstance,
  options: AuthOptions = {},
): Promise<void> {
  const token = options.token ?? resolveAuthToken();
  const isDev =
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test" ||
    !process.env.NODE_ENV;

  if (token) {
    server.addHook(
      "onRequest",
      async (request: FastifyRequest, reply: FastifyReply) => {
        const authHeader = request.headers.authorization;
        if (!authHeader || authHeader !== `Bearer ${token}`) {
          reply.code(401).send({ error: "Unauthorized" });
        }
      },
    );
    return;
  }

  if (isDev) {
    server.addHook(
      "onRequest",
      async (_request: FastifyRequest, reply: FastifyReply) => {
        reply.header("X-Auth-Mode", "open-dev");
      },
    );
    return;
  }

  server.addHook(
    "onRequest",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      reply
        .code(401)
        .send({ error: "Server not configured: no API token set" });
    },
  );
}

export function authStatus(): { authenticated: boolean; mode: string } {
  const token = resolveAuthToken();
  const isDev =
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test" ||
    !process.env.NODE_ENV;
  if (token) return { authenticated: true, mode: "token" };
  if (isDev) return { authenticated: false, mode: "open-dev" };
  return { authenticated: false, mode: "fail-closed" };
}
