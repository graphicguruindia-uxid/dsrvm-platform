async function probe(name: string, w: { fetch(r: Request): Promise<Response> }, url: string, init?: RequestInit) {
  try {
    const res = await w.fetch(new Request(url, init));
    const text = await res.text();
    console.log(`${name}: ${res.status} ${text.slice(0, 120)}`);
  } catch (err) {
    console.log(`${name}: THREW ${(err as Error).message}`);
  }
}

let apiWorker: { fetch(r: Request): Promise<Response> };
let hrWorker: { fetch(r: Request): Promise<Response> };
let webWorker: { fetch(r: Request): Promise<Response> };

try {
  apiWorker = (await import("../apps/api/src/worker.js")).default;
  console.log("api: module init OK");
} catch (err) {
  console.log(`api: MODULE INIT THREW ${(err as Error).message}`);
}

try {
  hrWorker = (await import("../apps/hr-automation/src/worker.js")).default;
  console.log("hr: module init OK");
} catch (err) {
  console.log(`hr: MODULE INIT THREW ${(err as Error).message}`);
}

try {
  webWorker = (await import("../apps/web/src/worker.js")).default;
  console.log("web: module init OK");
} catch (err) {
  console.log(`web: MODULE INIT THREW ${(err as Error).message}`);
}

await probe("api /health", apiWorker, "http://localhost/health");
await probe("hr /health", hrWorker, "http://localhost/health");
await probe("hr POST /api/roles", hrWorker, "http://localhost/api/roles", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ title: "QA Engineer", requirements: ["test"] }),
});
await probe("web /health", webWorker, "http://localhost/health");
await probe("web POST /api/tenants", webWorker, "http://localhost/api/tenants", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Acme", host: "acme.dsrvm.app" }),
});
