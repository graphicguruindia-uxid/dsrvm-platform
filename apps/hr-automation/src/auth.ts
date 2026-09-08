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
  if (!token) return;

  server.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.url === "/health" || request.url === "/") return;

      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply
          .code(401)
          .send({ error: "missing or malformed Authorization header" });
      }
      const provided = authHeader.slice(7).trim();
      if (provided !== token) {
        return reply.code(403).send({ error: "invalid API token" });
      }
    },
  );
}
