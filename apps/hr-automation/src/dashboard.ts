export function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>DSRVM HR Automation — Reviewer</title>
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
  textarea { min-height:64px; resize:vertical; }
  button { cursor:pointer; border-color:var(--accent); background:var(--accent); color:#fff; font-weight:600; }
  button.ok { border-color:var(--ok); background:var(--ok); color:#04110a; }
  button.bad { border-color:var(--bad); background:var(--bad); color:#120404; }
  .cards { display:grid; gap:12px; }
  .card { background:#10131a; border:1px solid var(--border); border-radius:8px; padding:12px; }
  .card-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
  .card-name { font-weight:600; }
  .score { font-weight:700; }
  .score.high { color:var(--ok); }
  .score.mid { color:#eab308; }
  .score.low { color:var(--bad); }
  .muted { color:var(--muted); font-size:12px; }
  .tags { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0; }
  .tag { background:#1b2030; border:1px solid var(--border); border-radius:999px; padding:2px 10px; font-size:12px; }
  .tag.flag { border-color:#7c2d12; background:#2a1508; color:#fdba74; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th, td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--border); }
  th { color:var(--muted); font-weight:500; }
  .empty { color:var(--muted); font-size:13px; padding:8px 0; }
  .actions { display:flex; gap:8px; align-items:center; margin-top:8px; }
  .note-input { flex:1; }
</style>
</head>
<body>
<header>
  <h1>DSRVM HR Automation — Reviewer</h1>
  <span class="badge" id="status">demo</span>
</header>
<main>
  <section class="panel">
    <h2>New candidate</h2>
    <form id="intake">
      <div class="row">
        <input name="name" placeholder="Full name" required />
        <input name="email" type="email" placeholder="Email" required />
      </div>
      <select name="roleId" required><option value="">Select role…</option></select>
      <textarea name="resumeText" placeholder="Paste resume text…" required></textarea>
      <div><button type="submit">Ingest + AI screen</button></div>
    </form>
  </section>

  <section class="panel">
    <h2>Review queue (pending_review)</h2>
    <div class="cards" id="queue"></div>
    <div class="empty" id="queueEmpty">No candidates waiting for review.</div>
  </section>

  <section class="panel">
    <h2>Audit trail</h2>
    <table><thead><tr><th>Time</th><th>Action</th><th>Candidate</th></tr></thead><tbody id="audit"></tbody></table>
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

  async function loadRoles() {
    const data = await api("/api/roles");
    const select = $("#intake [name=roleId]");
    select.innerHTML = '<option value="">Select role…</option>' + data.roles.map((r) => '<option value="' + r.id + '">' + esc(r.title) + "</option>").join("");
  }

  async function loadQueue() {
    const data = await api("/api/candidates?status=pending_review");
    const box = $("#queue");
    box.innerHTML = "";
    $("#queueEmpty").style.display = data.candidates.length ? "none" : "block";
    for (const c of data.candidates) {
      const s = c.screening;
      const scoreCls = s.score >= 75 ? "high" : s.score >= 55 ? "mid" : "low";
      const el = document.createElement("div");
      el.className = "card";
      el.innerHTML =
        '<div class="card-head"><span class="card-name">' + esc(c.name) + "</span>" +
        '<span class="score ' + scoreCls + '">' + s.score + "/100</span></div>" +
        '<div class="muted">' + esc(c.email) + " · " + esc(s.recommendation) + " · " + esc(s.provider) + "</div>" +
        "<p>" + esc(s.summary) + "</p>" +
        '<div class="tags">' + s.strengths.map((t) => '<span class="tag">' + esc(t) + "</span>").join("") + "</div>" +
        (s.flags.length ? '<div class="tags">' + s.flags.map((t) => '<span class="tag flag">' + esc(t) + "</span>").join("") + "</div>" : "") +
        '<div class="actions"><input class="note-input" placeholder="Note (optional)" />' +
        '<button class="ok">Approve</button><button class="bad">Reject</button></div>';
      el.querySelector(".ok").addEventListener("click", () => review(c.id, true, el));
      el.querySelector(".bad").addEventListener("click", () => review(c.id, false, el));
      box.appendChild(el);
    }
  }

  async function review(id, approved, el) {
    const note = el.querySelector(".note-input").value;
    await api("/api/candidates/" + id + "/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ approved, reviewer: "reviewer@dsrvm", note }) });
    loadQueue();
    loadAudit();
  }

  async function loadAudit() {
    const data = await api("/api/audit");
    $("#audit").innerHTML = data.events.slice(-20).reverse().map((e) => "<tr><td>" + esc(e.at) + "</td><td>" + esc(e.action) + "</td><td>" + esc(e.candidateId || "—") + "</td></tr>").join("");
  }

  $("#intake").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api("/api/candidates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ roleId: fd.get("roleId"), name: fd.get("name"), email: fd.get("email"), resumeText: fd.get("resumeText") }) });
    e.target.reset();
    loadQueue();
    loadAudit();
  });

  loadRoles();
  loadQueue();
  loadAudit();
</script>
</body>
</html>
`;
}
