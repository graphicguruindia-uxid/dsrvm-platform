export function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>DSRVM — Enterprise Web Reference (Admin Console)</title>
<style>
  :root { --bg:#0f1115; --panel:#171a21; --border:#262b36; --text:#e6e9ef; --muted:#8b93a3; --accent:#6366f1; --ok:#22c55e; --bad:#ef4444; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:system-ui, -apple-system, "Segoe UI", sans-serif; background:var(--bg); color:var(--text); }
  header { display:flex; align-items:center; justify-content:space-between; padding:14px 20px; border-bottom:1px solid var(--border); }
  header h1 { font-size:16px; margin:0; }
  .badge { font-size:12px; color:var(--muted); }
  main { max-width:1000px; margin:0 auto; padding:20px; display:grid; gap:20px; }
  .panel { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:16px; }
  .panel h2 { margin:0 0 12px; font-size:13px; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; }
  form { display:grid; gap:8px; }
  .row { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  input, select, textarea, button { background:#10131a; color:var(--text); border:1px solid var(--border); border-radius:6px; padding:8px 10px; font-size:13px; font-family:inherit; }
  button { cursor:pointer; border-color:var(--accent); background:var(--accent); color:#fff; font-weight:600; }
  .stats { display:grid; grid-template-columns:repeat(auto-fit, minmax(140px,1fr)); gap:12px; }
  .stat { background:#10131a; border:1px solid var(--border); border-radius:8px; padding:12px; }
  .stat b { display:block; font-size:22px; }
  .stat span { color:var(--muted); font-size:12px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th, td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--border); }
  th { color:var(--muted); font-weight:500; }
  .empty { color:var(--muted); font-size:13px; padding:8px 0; }
</style>
</head>
<body>
<header>
  <h1>DSRVM — Enterprise Web Reference</h1>
  <span class="badge" id="status">admin console</span>
</header>
<main>
  <section class="panel">
    <h2>Reference flow</h2>
    <p class="empty">POST /api/tenants {"name","host"} creates a white-label tenant + owner. Login with owner@&lt;host&gt; / change-me-now, then manage CMS content, record metered AI usage, and read the tenant-scoped admin overview. See docs/web-reference-architecture.</p>
  </section>
  <section class="panel">
    <h2>Overview</h2>
    <div class="stats" id="stats"><div class="empty">Sign in to load.</div></div>
  </section>
  <section class="panel">
    <h2>Tenants</h2>
    <table><thead><tr><th>Name</th><th>Hosts</th><th>Plan</th><th>Users</th><th>Published</th><th>Usage $/mo</th></tr></thead><tbody id="tenants"></tbody></table>
  </section>
  <section class="panel">
    <h2>Create tenant</h2>
    <form id="create">
      <div class="row"><input name="name" placeholder="Tenant name" required /><input name="host" placeholder="acme.dsrvm.app" required /></div>
      <div><button type="submit">Create + bootstrap owner</button></div>
    </form>
  </section>
</main>
<script>
  const $ = (s) => document.querySelector(s);
  async function api(path, opts) {
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
  let token = localStorage.getItem("token") || "";

  async function login() {
    if (!token) { loadTenantList(); return; }
    try {
      const me = await api("/api/auth/me", { headers: { authorization: "Bearer " + token } });
      $("#status").textContent = "signed in as " + me.user.email;
      loadOverview();
    } catch {
      token = "";
      loadTenantList();
    }
  }

  async function loadOverview() {
    const o = await api("/api/admin/overview", { headers: { authorization: "Bearer " + token } });
    $("#stats").innerHTML =
      '<div class="stat"><b>' + o.tenants + '</b><span>tenants</span></div>' +
      '<div class="stat"><b>' + o.users + '</b><span>users</span></div>' +
      '<div class="stat"><b>' + o.contentItems + '</b><span>content items</span></div>' +
      '<div class="stat"><b>$' + o.monthUsageUsd.toFixed(2) + '</b><span>AI usage this month</span></div>';
    $("#tenants").innerHTML = o.perTenant.map((t) =>
      "<tr><td>" + esc(t.name) + "</td><td>" + esc(t.hosts.join(", ")) + "</td><td>" + esc(t.plan) + "</td><td>" + t.users + "</td><td>" + t.publishedItems + "</td><td>$" + t.monthUsageUsd.toFixed(2) + "</td></tr>").join("");
  }

  async function loadTenantList() {
    const res = await fetch("/api/tenants");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    const rows = (data.tenants || []).map((t) =>
      "<tr><td>" + esc(t.name) + "</td><td>" + esc(t.hosts.join(", ")) + "</td><td>" + esc(t.plan) + "</td><td>—</td><td>—</td><td>—</td></tr>").join("");
    $("#tenants").innerHTML = rows || '<tr><td colspan="6" class="empty">No tenants yet.</td></tr>';
  }

  $("#create").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = await api("/api/tenants", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: fd.get("name"), host: fd.get("host") }) });
    const loginRes = await api("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenantId: data.tenant.id, email: data.ownerEmail, password: "change-me-now" }) });
    token = loginRes.token;
    localStorage.setItem("token", token);
    e.target.reset();
    login();
  });

  login();
</script>
</body>
</html>
`;
}
