export function createWorkerServerFactory() {
  return function serverFactory(handler: unknown) {
    const events: Record<string, Array<(...args: unknown[]) => void>> = {};
    const server: Record<string, unknown> = {
      listening: false,
      handler,
      address: () => ({ address: "0.0.0.0", port: 0 }),
      close: (cb?: (err?: unknown) => void) => {
        if (cb) cb(undefined);
        return server;
      },
      setTimeout: () => server,
      ref: () => server,
      unref: () => server,
      closeIdleConnections: () => {},
      closeAllConnections: () => {},
      closeHttp2Sessions: () => {},
      keepAliveTimeout: 5000,
      requestTimeout: 0,
    };
    const emitter = {
      on: (event: string, cb: (...args: unknown[]) => void) => {
        (events[event] ??= []).push(cb);
        return server;
      },
      once: (event: string, cb: (...args: unknown[]) => void) => {
        const wrapped = (...args: unknown[]) => {
          const list = events[event];
          if (list) {
            const idx = list.indexOf(wrapped);
            if (idx >= 0) list.splice(idx, 1);
          }
          cb(...args);
        };
        (events[event] ??= []).push(wrapped);
        return server;
      },
      removeListener: (event: string, cb: (...args: unknown[]) => void) => {
        const list = events[event];
        if (list) {
          const idx = list.indexOf(cb);
          if (idx >= 0) list.splice(idx, 1);
        }
        return server;
      },
      removeAllListeners: (event?: string) => {
        if (event) delete events[event];
        else {
          for (const key of Object.keys(events)) delete events[key];
        }
        return server;
      },
      emit: (event: string, ...args: unknown[]) => {
        for (const cb of events[event] ?? []) cb(...args);
        return true;
      },
    };
    Object.assign(server, emitter);
    return server;
  };
}

export interface InjectOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  payload?: string;
}

export interface InjectResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}

export interface Injectable {
  inject(options: InjectOptions): Promise<InjectResponse>;
}

export async function fetchHandler(
  app: Injectable,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const res = await app.inject({
    method: request.method,
    url: url.pathname + url.search,
    headers,
    payload: await request.text(),
  });
  return new Response(res.body, {
    status: res.statusCode,
    headers: res.headers,
  });
}
