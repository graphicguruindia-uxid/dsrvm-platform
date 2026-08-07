import { buildServer } from "./server.js";

const app = buildServer();
await app.ready();

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const res = await app.inject({
      method: request.method as "GET",
      url: url.pathname + url.search,
      headers,
      payload: await request.text(),
    });
    return new Response(res.body, {
      status: res.statusCode,
      headers: res.headers as unknown as Record<string, string>,
    });
  },
};
