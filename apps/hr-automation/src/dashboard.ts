export function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>DSRVM HR Automation</title>
<style>
:root{--bg:#0a0c10;--surface:#13161d;--surface2:#1a1e28;--border:#22262f;--text:#e4e7ee;--muted:#7a8399;--accent:#6366f1;--accent2:#818cf8;--ok:#22c55e;--warn:#eab308;--bad:#ef4444;--info:#3b82f6;--radius:8px;--radius-lg:12px}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:14px}
body{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--text);display:flex;min-height:100vh}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.sidebar{width:220px;min-height:100vh;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:10}
.sidebar .brand{padding:18px 20px 14px;border-bottom:1px solid var(--border);font-size:13px;font-weight:700;letter-spacing:.03em;color:var(--accent)}
.sidebar nav{flex:1;padding:8px 0}
.sidebar nav a{display:flex;align-items:center;gap:10px;padding:10px 20px;font-size:13px;color:var(--muted);transition:background .15s,color .15s;border-left:3px solid transparent}
.sidebar nav a:hover{background:var(--surface2);color:var(--text);text-decoration:none}
.sidebar nav a.active{background:var(--surface2);color:var(--accent);border-left-color:var(--accent);font-weight:600}
.sidebar nav a .icon{width:18px;text-align:center;font-size:14px}
.main{margin-left:220px;flex:1;padding:28px 32px;min-height:100vh}
.main h1{font-size:20px;font-weight:700;margin-bottom:20px}
.main h2{font-size:14px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:12px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px}
.card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-bottom:20px}
.kpi{text-align:center;padding:18px 14px}
.kpi .value{font-size:28px;font-weight:700;margin-bottom:4px}
.kpi .label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
.kpi.ok .value{color:var(--ok)}
.kpi.warn .value{color:var(--warn)}
.kpi.bad .value{color:var(--bad)}
.kpi.info .value{color:var(--info)}
.kpi.accent .value{color:var(--accent)}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:8px 10px;font-weight:600;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid var(--border)}
td{padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:top}
tr:hover td{background:var(--surface2)}
.badge{display:inline-block;font-size:11px;font-weight:600;padding:3px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:.03em}
.badge.pending_review{background:#1e2a4a;color:#818cf8}
.badge.pending_screening{background:#2a2215;color:var(--warn)}
.badge.approved{background:#0d2818;color:var(--ok)}
.badge.rejected{background:#2a1215;color:var(--bad)}
.badge.advance{background:#0d2818;color:var(--ok)}
.badge.reject{background:#2a1215;color:var(--bad)}
.badge.needs_review{background:#2a2215;color:var(--warn)}
.badge.open{background:#2a1215;color:var(--bad)}
.badge.resolved{background:#0d2818;color:var(--ok)}
.form-grid{display:grid;gap:10px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
input,select,textarea{background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);padding:9px 12px;font-size:13px;font-family:inherit;width:100%;transition:border-color .15s}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--accent)}
textarea{min-height:80px;resize:vertical}
button{cursor:pointer;border:none;border-radius:var(--radius);padding:9px 18px;font-size:13px;font-weight:600;font-family:inherit;transition:background .15s,opacity .15s}
button:disabled{opacity:.5;cursor:not-allowed}
button.primary{background:var(--accent);color:#fff}
button.primary:hover{background:var(--accent2)}
button.success{background:var(--ok);color:#04110a}
button.danger{background:var(--bad);color:#fff}
button.ghost{background:transparent;color:var(--muted);border:1px solid var(--border)}
button.ghost:hover{background:var(--surface2);color:var(--text)}
.search-bar{display:flex;gap:10px;align-items:center;margin-bottom:14px}
.search-bar input{flex:1}
.pills{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}
.pill{padding:5px 14px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;transition:all .15s}
.pill:hover{border-color:var(--accent);color:var(--text)}
.pill.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.score-ring{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;border:3px solid var(--border);margin:0 auto 8px}
.score-ring.high{border-color:var(--ok);color:var(--ok)}
.score-ring.mid{border-color:var(--warn);color:var(--warn)}
.score-ring.low{border-color:var(--bad);color:var(--bad)}
.tag{display:inline-block;font-size:11px;padding:3px 10px;border-radius:999px;background:var(--surface2);border:1px solid var(--border);margin:2px}
.tag.strength{border-color:#0d2818;color:var(--ok)}
.tag.flag{border-color:#2a1215;color:var(--bad)}
.detail-header{display:flex;align-items:center;gap:16px;margin-bottom:20px;flex-wrap:wrap}
.detail-header h1{margin-bottom:0}
.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
.detail-panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px}
.detail-panel h3{font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;margin-bottom:10px}
.empty{color:var(--muted);font-size:13px;padding:16px 0;text-align:center}
.loading{color:var(--muted);font-size:13px;padding:24px 0;text-align:center}
.toast-container{position:fixed;top:16px;right:16px;z-index:100;display:grid;gap:8px}
.toast{padding:10px 16px;border-radius:var(--radius);font-size:13px;font-weight:500;color:#fff;opacity:0;transform:translateX(20px);animation:toastIn .2s forwards;max-width:340px}
.toast.success{background:#0d5530}
.toast.error{background:#5a1a1a}
.toast.info{background:#1a2e50}
@keyframes toastIn{to{opacity:1;transform:translateX(0)}}
.back{display:inline-flex;align-items:center;gap:6px;background:none;border:none;padding:0;font-family:inherit;font-size:13px;color:var(--muted);margin-bottom:14px;cursor:pointer;text-align:left}
.back:hover{color:var(--text)}
.timeline{border-left:2px solid var(--border);padding-left:16px;margin-top:8px}
.timeline .event{padding:8px 0;font-size:13px;color:var(--muted)}
.timeline .event .action{color:var(--text);font-weight:600}
.timeline .event .time{font-size:11px;color:var(--muted);margin-top:2px}
.section-gap{margin-bottom:20px}
.expandable pre{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:10px;font-size:12px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto;margin-top:6px}
@media(max-width:768px){
.sidebar{position:relative;width:100%;min-height:auto;border-right:none;border-bottom:1px solid var(--border)}
.sidebar nav{display:flex;overflow-x:auto;padding:4px 0}
.sidebar nav a{padding:8px 14px;white-space:nowrap;border-left:none;border-bottom:3px solid transparent;font-size:12px}
.sidebar nav a.active{border-bottom-color:var(--accent);border-left:none}
.main{margin-left:0;padding:16px}
.detail-grid{grid-template-columns:1fr}
.form-row{grid-template-columns:1fr}
.card-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}
table{font-size:12px}
th,td{padding:6px 6px}
}
#main{display:block;flex:1;min-width:0}
.skip-link{position:absolute;left:-9999px;top:0;z-index:10000;padding:8px 16px;background:var(--accent);color:#fff}
.skip-link:focus{left:0}
button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.bar-chart{display:flex;flex-direction:column;gap:8px}
.bar-row{display:flex;align-items:center;gap:8px;font-size:12px}
.bar-label{width:100px;text-align:right;color:var(--muted)}
.bar-track{flex:1;height:20px;background:var(--border);border-radius:4px;overflow:hidden}
.bar-fill{height:100%;border-radius:4px;min-width:2px}
.bar-value{width:50px;font-weight:600}
.bar-fill.approved{background:#22c55e}
.bar-fill.pending_review{background:#f59e0b}
.bar-fill.rejected{background:#ef4444}
.bar-fill.pending_screening{background:#3b82f6}
.histogram{display:flex;align-items:flex-end;gap:12px;height:120px;padding:8px}
.hist-bar{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px}
.hist-fill{width:100%;border-radius:4px 4px 0 0;min-height:4px}
.hist-fill.low{background:#ef4444}
.hist-fill.mid{background:#f59e0b}
.hist-fill.high{background:#22c55e}
.hist-label{font-size:11px;color:var(--muted)}
.hist-count{font-size:12px;font-weight:600}
.field-label{display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:600}
.batch-bar{display:flex;gap:8px;align-items:center;padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px}
.pager-btn{background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer}
.pager-btn:disabled{opacity:.4;cursor:default}
.pager-btn:hover:not(:disabled){border-color:var(--accent)}
.pager-info{font-size:12px;color:var(--muted);min-width:110px;text-align:center}
.pill-count{opacity:.75;font-weight:400}
.stepper{display:flex;gap:8px;margin-bottom:20px}
.step{flex:1;text-align:center;padding:8px 10px;font-size:12px;color:var(--muted);border-top:3px solid var(--border)}
.step.active{color:var(--accent);border-top-color:var(--accent);font-weight:600}
.step.active.done{color:var(--ok);border-top-color:var(--ok)}
.step.active.rej{color:var(--bad);border-top-color:var(--bad)}
.step .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--border);margin-right:6px;vertical-align:middle}
.step.active .dot{background:currentColor}
#ctable table{width:100%;border-collapse:collapse}
#ctable th,#ctable td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--border);font-size:13px;vertical-align:middle}
#ctable th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.03em}
#ctable tbody tr:hover td{background:var(--surface2)}
/* ---- tagline + mobile-first shell ---- */
.tagline{display:block;font-size:10.5px;font-weight:400;color:var(--muted);letter-spacing:0;line-height:1.4;margin-top:5px}
.mobile-bar{display:none;position:sticky;top:0;z-index:60;align-items:center;gap:10px;padding:10px 12px;background:var(--surface);border-bottom:1px solid var(--border)}
.mb-toggle{background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:var(--radius);font-size:15px;line-height:1;padding:0 12px;min-width:44px;min-height:40px;cursor:pointer;font-family:inherit}
.mb-brand{font-weight:600;font-size:14px;display:flex;flex-direction:column;min-width:0}
.scrim{display:none;position:fixed;top:0;right:0;bottom:0;left:0;background:rgba(0,0,0,.45);z-index:65}
.scrim.show{display:block}
.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
@media(max-width:768px){
.mobile-bar{display:flex}
.sidebar{position:fixed;top:0;left:0;bottom:0;width:250px;min-height:100vh;z-index:70;transform:translateX(-100%);transition:transform .18s ease;overflow-y:auto;box-shadow:none}
.sidebar.open{transform:translateX(0);box-shadow:0 8px 32px rgba(0,0,0,.4)}
.sidebar nav{display:block;overflow-x:visible;padding:8px 0}
.sidebar nav a{border-left:3px solid transparent;border-bottom:none;padding:12px 18px;font-size:13px}
.sidebar nav a.active{border-left-color:var(--accent);border-bottom:none}
.main{padding:16px}
.detail-grid{grid-template-columns:1fr}
.form-row{grid-template-columns:1fr}
.card-grid{grid-template-columns:1fr}
table{font-size:12px;min-width:520px}
th,td{padding:6px}
input,select,textarea{font-size:16px}
.btn{min-height:40px}
}
@media(max-width:400px){.mobile-bar .tagline{display:none}}
.tenant-chip{display:block;margin-top:10px;padding:4px 8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface2);font-size:11px;font-weight:400;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.brand .logo{display:block;margin-bottom:4px}
.brand .logo img{height:auto;width:120px;max-width:100%;display:block}
.collapsible-header{display:flex;align-items:center;gap:8px;width:100%;background:none;border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;color:var(--text);font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;text-align:left}
.collapsible-header:hover{color:var(--accent)}
.collapsible-header .arrow{display:inline-block;transition:transform .18s ease;color:var(--muted);font-size:11px}
.collapsible.open>.collapsible-header .arrow{transform:rotate(90deg)}
.collapsible>.collapsible-body{padding:14px}
.collapsible:not(.open)>.collapsible-body{display:none}
</style>
</head>
<body>
<a href="#main" class="skip-link">Skip to content</a>
<aside class="sidebar" id="sidebar">
  <div class="brand"><span class="logo"><img src="https://dsrvmltd.co.uk/images/dsrvmltd-logo-i.png" data-attr-logo="" alt="DSRVM HR" width="120"></span><span class="tagline">AI‑Driven HR Automation, Scaled to Your Budget.</span><span class="tenant-chip"></span></div>
  <nav id="nav" aria-label="Sections"></nav>
</aside>
<main id="main" role="main"><div class="main" id="app" aria-live="polite"></div></main>
<div class="toast-container" id="toasts" role="status" aria-live="polite"></div>

<script>

(function(){
var routes=[
  {id:'overview',label:'Overview',icon:'▦'},
  {id:'tenants',label:'Tenants',icon:'◉'},
  {id:'analytics',label:'Analytics',icon:'📊'},
  {id:'candidates',label:'Candidates',icon:'☺'},
  {id:'scorecards',label:'Scorecards',icon:'✓'},
  {id:'compare',label:'Compare',icon:'≡'},
  {id:'roles',label:'Roles',icon:'⚙'},
  {id:'disputes',label:'Disputes',icon:'⚠'},
  {id:'outbox',label:'Outbox',icon:'✉'},
  {id:'audit',label:'Audit',icon:'↻'},
  {id:'ai-usage',label:'AI Usage',icon:'⬤'},
  {id:'runbooks',label:'Runbooks',icon:'≡'}
];
var navEl=document.getElementById('nav');
var appEl=document.getElementById('app');
var current='';
function h(tag,cls,html){var el=document.createElement(tag);if(cls)el.className=cls;if(html!==undefined)el.innerHTML=html;return el;}
function esc(s){return String(s=='null'||s==null?'':s).replace(/[&<>"]/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]);});}
function fmtDate(s){if(!s)return'—';var d=new Date(s);return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+' '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});}
function toast(msg,type){var c=document.getElementById('toasts');var t=h('div','toast '+(type||'info'),esc(msg));c.appendChild(t);setTimeout(function(){t.style.opacity='0';t.style.transform='translateX(20px)';setTimeout(function(){t.remove();},300);},3500);}
function badge(val){return '<span class="badge '+esc(val)+'">'+esc(val)+'</span>';}
async function api(path,opts){var h=opts&&opts.headers?Object.assign({},opts.headers):{};var tid=localStorage.getItem('tenantId');if(tid)h['X-Tenant-Id']=tid;opts=Object.assign({},opts||{},{headers:h});var res=await fetch(path,opts);var data=await res.json().catch(function(){return{};});if(!res.ok)throw new Error(data.error||res.statusText);return data;}
function statusPill(s,active){return '<button class="pill'+(active?' active':'')+'" data-status="'+esc(s)+'">'+esc(s)+'</button>';}
function scoreClass(s){return s>=70?'high':s>=40?'mid':'low';}

var _nav='';routes.forEach(function(r){_nav+='<a href="#/'+r.id+'" id="nav-'+r.id+'"><span class="icon">'+r.icon+'</span>'+esc(r.label)+'</a>';});
navEl.innerHTML=_nav;

function nav(active){current=active;paintTenant();routes.forEach(function(r){var el=document.getElementById('nav-'+r.id);if(el){var on=r.id===active;el.className=on?'active':'';if(on)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');}});}

function paintTenant(){var id=localStorage.getItem('tenantId')||'';var nm=localStorage.getItem('tenantName')||'';var label=id?(nm||'Unknown tenant'):'No tenant (shared)';var els=document.querySelectorAll('.tenant-chip');for(var i=0;i<els.length;i++){els[i].textContent=label;els[i].title=id;}}
function loadNav(){nav(current);}

window.addEventListener('hashchange',route);// --- mobile shell: off-canvas nav drawer + scrollable tables ---
var sidebar = document.getElementById("sidebar");
var scrim = h("div", "scrim");
document.body.appendChild(scrim);
var mobileBar = h("div", "mobile-bar");
mobileBar.innerHTML =
  '<button id="navToggle" class="mb-toggle" aria-label="Open navigation menu" aria-expanded="false" aria-controls="sidebar">☰</button>' +
  '<span class="mb-brand">DSRVM HR<span class="tagline">AI‑Driven HR Automation, Scaled to Your Budget.</span><span class="tenant-chip"></span></span>';
if (sidebar && sidebar.parentNode) {
  sidebar.parentNode.insertBefore(mobileBar, sidebar.nextSibling);
} else {
  document.body.insertBefore(mobileBar, document.body.firstChild);
}
function closeNav() {
  if (sidebar) sidebar.classList.remove("open");
  scrim.classList.remove("show");
  var t = document.getElementById("navToggle");
  if (t) t.setAttribute("aria-expanded", "false");
}
document.addEventListener("click", function (e) {
  var t = document.getElementById("navToggle");
  if (t && (e.target === t || t.contains(e.target))) {
    if (!sidebar) return;
    var open = !sidebar.classList.contains("open");
    sidebar.classList.toggle("open", open);
    scrim.classList.toggle("show", open);
    t.setAttribute("aria-expanded", String(open));
    return;
  }
  if (e.target === scrim) closeNav();
});
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") closeNav();
});
window.addEventListener("hashchange", closeNav);
document.addEventListener("click", function (e) {
  var hdr = e.target.closest(".collapsible-header");
  if (!hdr) return;
  var wrap = hdr.closest(".collapsible");
  if (!wrap) return;
  var open = !wrap.classList.contains("open");
  wrap.classList.toggle("open", open);
  hdr.setAttribute("aria-expanded", String(open));
});
window.addEventListener("resize", function () {
  if (window.innerWidth > 768) closeNav();
});
function wrapTables() {
  var tables = appEl.querySelectorAll("table");
  for (var i = 0; i < tables.length; i++) {
    var t = tables[i];
    if (t.parentNode && t.parentNode.className === "table-wrap") continue;
    var w = h("div", "table-wrap");
    t.parentNode.insertBefore(w, t);
    w.appendChild(t);
  }
}
if (window.MutationObserver) {
  new MutationObserver(function () {
    wrapTables();
  }).observe(appEl, { childList: true, subtree: true });
}
function route(){var hash=(location.hash||'#/overview').replace('#/','');var parts=hash.split('/');var page=parts[0];if((page==='candidate'||page==='candidates')&&parts[1])window.render_candidate(parts[1]);else if(typeof window['render_'+page.replace(/-/g,'_')]==='function')window['render_'+page.replace(/-/g,'_')]();else window.render_overview();}

window.render_tenants = async function () {
  nav("tenants");
  appEl.innerHTML = '<div class="loading" role="status" aria-busy="true">Loading…</div>';
  try {
    var data = await api("/api/tenants");
    var tenants = data.tenants || [];
    var currentTenant = localStorage.getItem("tenantId") || "";
    var savedName = localStorage.getItem("tenantName") || "";
    var activeName = "";
    tenants.forEach(function (t) {
      if (t.id === currentTenant) activeName = t.name;
    });
    var displayName = activeName || (currentTenant ? savedName : "");
    // A tenant id that no longer exists means the stored data was lost (server restart).
    var isStale = !!currentTenant && !displayName;
    var html = '<div class="card"><div class="card-header"><h2>Tenants</h2></div>';
    html +=
      '<p style="margin:0 0 14px;font-size:13px;color:var(--muted)">A <strong>tenant</strong> is an isolated workspace — every role, candidate, scorecard, dispute and audit event belongs to exactly one tenant, and switching tenants switches the whole dashboard to that tenant’s data.</p>';
    html +=
      '<form id="create-tenant-form" style="margin-bottom:16px;display:flex;gap:10px;align-items:end;flex-wrap:wrap"><div><label for="tenant-name" style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px">Tenant Name</label><input id="tenant-name" class="input" placeholder="Enter tenant name" aria-label="Tenant name" required/></div><button type="submit" class="btn primary" aria-label="Create tenant">Create Tenant</button></form>';
    if (currentTenant) {
      html +=
        '<div style="margin-bottom:14px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface2);font-size:13px">' +
        'Active tenant: <strong style="color:var(--accent)" title="' +
        esc(currentTenant) +
        '">' +
        esc(displayName) +
        "</strong> ";
      if (isStale) {
        html +=
          '<span style="color:#b45309">no longer exists — the server was restarted and its data reset.</span> ';
      }
      html += '<a href="#" id="clear-tenant" style="font-size:12px">Switch to no tenant</a></div>';
    }
    html +=
      '<table aria-label="Tenants"><thead><tr><th scope="col">Name</th><th scope="col">ID</th><th scope="col">Created</th><th scope="col">Action</th></tr></thead><tbody>';
    tenants.forEach(function (t) {
      var isActive = t.id === currentTenant && !isStale;
      html +=
        "<tr" +
        (isActive ? ' style="background:var(--surface2)"' : "") +
        "><td>" +
        esc(t.name) +
        '</td><td style="font-family:monospace;font-size:12px;color:var(--muted)">' +
        esc(t.id) +
        "</td><td>" +
        fmtDate(t.createdAt) +
        "</td><td>";
      if (isActive) {
        html += '<span class="badge advance">Active</span>';
      } else {
        html +=
          '<button class="btn" data-switch-tenant="' +
          esc(t.id) +
          '" data-tenant-name="' +
          esc(t.name) +
          '" aria-label="Switch to ' +
          esc(t.name) +
          '">Switch</button>';
      }
      html += "</td></tr>";
    });
    html += "</tbody></table></div>";
    appEl.innerHTML = html;

    appEl.querySelectorAll("[data-switch-tenant]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        window._switchTenant(btn.getAttribute("data-switch-tenant"), btn.getAttribute("data-tenant-name"));
      });
    });

    document.getElementById("create-tenant-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      var name = document.getElementById("tenant-name").value.trim();
      if (!name) return;
      try {
        var created = await api("/api/tenants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name }),
        });
        toast("Tenant created", "success");
        if (created && created.tenant && created.tenant.id) {
          window._switchTenant(created.tenant.id, created.tenant.name);
        } else {
          window.render_tenants();
        }
      } catch (err) {
        toast(err.message, "error");
      }
    });

    var clearBtn = document.getElementById("clear-tenant");
    if (clearBtn) {
      clearBtn.addEventListener("click", function (e) {
        e.preventDefault();
        window._switchTenant("", "");
        toast("Switched to no tenant", "success");
      });
    }
  } catch (e) {
    appEl.innerHTML = '<div class="empty" role="alert">' + esc(e.message) + "</div>";
  }
};

window._switchTenant=function(id,name){if(id){localStorage.setItem('tenantId',id);localStorage.setItem('tenantName',name||'');toast('Switched to '+(name||'tenant'),'success');}else{localStorage.removeItem('tenantId');localStorage.removeItem('tenantName');}paintTenant();window.render_tenants();};

window.render_overview=async function(){nav('overview');appEl.innerHTML='<div class="loading" role="status" aria-busy="true">Loading…</div>';try{var stats=await api('/api/stats');var kpis='';kpis+='<div class="card kpi accent"><div class="value">'+(stats.total||0)+'</div><div class="label">Total Candidates</div></div>';kpis+='<div class="card kpi info"><div class="value">'+(stats.byStatus.pending_review||0)+'</div><div class="label">Pending Review</div></div>';kpis+='<div class="card kpi ok"><div class="value">'+(stats.byStatus.approved||0)+'</div><div class="label">Approved</div></div>';kpis+='<div class="card kpi bad"><div class="value">'+(stats.byStatus.rejected||0)+'</div><div class="label">Rejected</div></div>';kpis+='<div class="card kpi '+(stats.avgScore!=null?scoreClass(stats.avgScore):'')+'"><div class="value">'+(stats.avgScore!=null?stats.avgScore:'—')+'</div><div class="label">Avg Score</div></div>';kpis+='<div class="card kpi '+(stats.disputes.raised>stats.disputes.resolved?'warn':'ok')+'"><div class="value">'+stats.disputes.raised+'</div><div class="label">Disputes Raised</div></div>';var outbox='';if(stats.ai){outbox+='<div class="card kpi info"><div class="value">'+stats.ai.calls+'</div><div class="label">AI Calls</div></div>';outbox+='<div class="card kpi"><div class="value">$'+stats.ai.estCostUsd.toFixed(2)+'</div><div class="label">Est. Cost (USD)</div></div>';}outbox+='<div class="card kpi"><div class="value">'+stats.pendingOutbox+'</div><div class="label">Pending Outbox</div></div>';var html='<h1>Overview</h1><div class="card-grid">'+kpis+'</div>'+(outbox?'<h2>Pipeline</h2><div class="card-grid">'+outbox+'</div>':'');try{var mdata=await api('/api/metrics');var m=mdata.metrics||{};if(m.roles&&m.roles.length){html+='<h2>Capacity by Role</h2><table aria-label="Capacity by role"><thead><tr><th scope="col">Role</th><th scope="col">In Pipeline</th><th scope="col">Pending Review</th><th scope="col">Approved</th><th scope="col">Rejected</th><th scope="col">Avg Screen Time (h)</th></tr></thead><tbody>';m.roles.forEach(function(r){html+='<tr><td>'+esc(r.title)+'</td><td>'+r.candidatesInPipeline+'</td><td>'+r.candidatesPendingReview+'</td><td class="ok">'+r.candidatesApproved+'</td><td class="bad">'+r.candidatesRejected+'</td><td>'+r.avgScreeningTimeHours.toFixed(1)+'</td></tr>';});html+='</tbody></table>';}if(m.overall){html+='<h2>Capacity Summary</h2><div class="card-grid"><div class="card kpi info"><div class="value">'+m.overall.totalCandidates+'</div><div class="label">Total Pipeline</div></div><div class="card kpi"><div class="value">'+m.overall.pendingScreening+'</div><div class="label">Pending Screening</div></div><div class="card kpi ok"><div class="value">'+m.overall.approved+'</div><div class="label">Approved</div></div><div class="card kpi bad"><div class="value">'+m.overall.rejected+'</div><div class="label">Rejected</div></div></div>';}}catch(e){/* metrics optional */}appEl.innerHTML=html;}catch(e){appEl.innerHTML='<h1>Overview</h1><div class="card empty" role="alert">'+esc(e.message)+'</div>';}};

window.render_candidates = async function () {
  nav("candidates");
  var searchQ = "";
  var statusQ = "";
  var page = 1;
  var pageSize = 10;
  var total = 0;
  var counts = {};
  var roleMap = {};
  var selected = {};
  appEl.innerHTML =
    '<h1>Candidates</h1>' +
    '<div class="card section-gap"><div class="card-header"><h2 style="margin:0">Add Candidate</h2>' +
    '<div style="display:flex;gap:8px"><button type="button" class="ghost" id="exportCsvBtn" style="font-size:12px" aria-label="Export candidates to CSV">Export CSV</button></div></div>' +
    '<p style="color:var(--muted);font-size:13px;margin-bottom:12px">Paste a resume / CV, or drop a <strong>PDF</strong>, <strong>DOCX</strong>, <strong>.txt</strong> or <strong>.md</strong> file. PDF and DOCX files are parsed automatically — the name, email and role are extracted from the document. Name, email and role are extracted from the document; new candidates start at <strong>Screening</strong> and auto-advance to <strong>Review</strong>.</p>' +
    '<div id="dropZone" style="border:1px dashed var(--border);border-radius:8px;padding:14px;text-align:center;color:var(--muted);font-size:13px">Drag &amp; drop a resume here, or <label style="color:var(--accent);cursor:pointer" for="resumeFile">browse<input type="file" id="resumeFile" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style="display:none" aria-label="Upload resume file"></label></div>' +
    '<textarea id="resumeText" aria-label="Paste resume text" placeholder="Paste resume / CV / profile text here&hellip;" style="min-height:120px;margin-top:8px"></textarea>' +
    '<div class="form-grid" style="margin-top:12px">' +
    '<div><label class="field-label" for="draftName">Name</label><input id="draftName" aria-label="Candidate name" placeholder="From document, or type" style="width:100%"></div>' +
    '<div><label class="field-label" for="draftEmail">Email</label><input id="draftEmail" type="email" aria-label="Candidate email" placeholder="From document, or type" style="width:100%"></div>' +
    '<div><label class="field-label" for="draftRole">Role</label><select id="draftRole" aria-label="Select role" style="width:100%"><option value="">&mdash; select role &mdash;</option></select></div>' +
    '<div><div class="field-label">Recommended roles</div><div id="draftWhy" style="font-size:12px;color:var(--muted);line-height:1.6">Parse a document to see recommendations.</div></div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:12px;align-items:center">' +
    '<button type="button" class="ghost" id="parseBtn" aria-label="Parse document and recommend roles">Parse &amp; Recommend</button>' +
    '<button type="button" class="primary" id="createBtn" aria-label="Create candidate">Create Candidate</button>' +
    '</div></div>' +
    '<div class="search-bar"><input id="csearch" placeholder="Search by name or email&hellip;" aria-label="Search candidates by name or email"></div>' +
    '<div class="pills" id="cpills"></div>' +
    '<div class="batch-bar" id="batchBar" style="display:none;margin-bottom:12px">' +
    '<span id="selCount" style="font-size:12px;color:var(--muted)">0 selected</span>' +
    '<button type="button" class="primary" id="batchApprove" style="font-size:12px" aria-label="Approve selected candidates">Approve</button>' +
    '<button type="button" class="danger ghost" id="batchReject" style="font-size:12px" aria-label="Reject selected candidates">Reject</button>' +
    '<button type="button" class="danger ghost" id="batchDelete" style="font-size:12px" aria-label="Delete selected candidates">Delete</button>' +
    '</div>' +
    '<div class="card" id="ctable"><div class="loading" role="status" aria-busy="true">Loading&hellip;</div></div>' +
    '<div id="pager" style="display:flex;gap:8px;justify-content:center;align-items:center;margin-top:12px"></div>';

  var pillEl = document.getElementById("cpills");
  var all = ["all", "pending_screening", "pending_review", "approved", "rejected"];
  all.forEach(function (s, i) {
    pillEl.innerHTML +=
      '<button class="pill' +
      (i === 0 ? " active" : "") +
      '" data-status="' +
      s +
      '" aria-pressed="' +
      (i === 0 ? "true" : "false") +
      '">' +
      s +
      '<span class="pill-count" data-pc="' +
      s +
      '"></span></button>';
  });
  pillEl.addEventListener("click", function (e) {
    var btn = e.target.closest(".pill");
    if (!btn) return;
    var st = btn.getAttribute("data-status");
    statusQ = st === "all" ? "" : st;
    page = 1;
    pillEl.querySelectorAll(".pill").forEach(function (p) {
      var on = p === btn;
      p.className = "pill" + (on ? " active" : "");
      p.setAttribute("aria-pressed", on ? "true" : "false");
    });
    load();
  });

  var csearch = document.getElementById("csearch");
  var ctimer = null;
  csearch.addEventListener("input", function () {
    clearTimeout(ctimer);
    ctimer = setTimeout(function () {
      searchQ = csearch.value.trim();
      page = 1;
      load();
    }, 300);
  });

  function updatePills() {
    pillEl.querySelectorAll(".pill").forEach(function (p) {
      var s = p.getAttribute("data-status");
      var c = s === "all" ? counts._total : counts[s] || 0;
      var sp = p.querySelector(".pill-count");
      if (sp) sp.textContent = " (" + c + ")";
    });
  }

  async function loadStats() {
    try {
      var st = await api("/api/stats");
      counts = st.byStatus || {};
      counts._total = st.total || 0;
      updatePills();
    } catch (e) {
      /* stats are advisory */
    }
  }

  async function loadRoles() {
    try {
      var d = await api("/api/roles");
      roleMap = {};
      (d.roles || []).forEach(function (r) {
        roleMap[r.id] = r.title;
      });
      var sel = document.getElementById("draftRole");
      var cur = sel.value;
      sel.innerHTML = '<option value="">&mdash; select role &mdash;</option>';
      (d.roles || []).forEach(function (r) {
        sel.innerHTML +=
          '<option value="' +
          esc(r.id) +
          '">' +
          esc(r.title) +
          "</option>";
      });
      if (cur) sel.value = cur;
    } catch (e) {
      /* role titles are best-effort */
    }
  }

  function updateBatchBar() {
    var n = Object.keys(selected).length;
    var bar = document.getElementById("batchBar");
    bar.style.display = n ? "flex" : "none";
    document.getElementById("selCount").textContent = n + " selected";
  }

  function renderTable(rows) {
    var table = document.getElementById("ctable");
    if (!rows.length) {
      table.innerHTML =
        '<div style="padding:28px;text-align:center;color:var(--muted);font-size:13px">No candidates found. Paste a resume above to add the first one.</div>';
      return;
    }
    var html =
      '<table style="width:100%"><thead><tr>' +
      '<th scope="col" style="width:36px"><input type="checkbox" id="selAll" aria-label="Select all candidates on this page"></th>' +
      '<th scope="col">Name</th><th scope="col">Role</th><th scope="col">Created</th><th scope="col">Score</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>';
    rows.forEach(function (c) {
      var rc = c.roleTitle || roleMap[c.roleId] || c.roleId;
      var hasScore = !!(c.screening && c.screening.score != null);
      var score = hasScore ? c.screening.score : "&mdash;";
      var scoreCls = hasScore
        ? c.screening.score >= 70
          ? "approved"
          : c.screening.score >= 40
            ? "needs_review"
            : "rejected"
        : "resolved";
      html +=
        "<tr>" +
        '<td><input type="checkbox" class="rowsel" data-id="' +
        esc(c.id) +
        '" aria-label="Select ' +
        esc(c.name) +
        '"></td>' +
        '<td><a href="#/candidates/' +
        esc(c.id) +
        '">' +
        esc(c.name) +
        '</a><div style="font-size:11px;color:var(--muted)">' +
        esc(c.email || "&mdash;") +
        "</div></td>" +
        "<td>" +
        esc(rc) +
        "</td>" +
        '<td style="font-size:12px;color:var(--muted);white-space:nowrap">' +
        fmtDate(c.createdAt) +
        "</td>" +
        '<td><span class="badge ' +
        scoreCls +
        '" title="Screening score">' +
        score +
        "</span></td>" +
        "<td>" +
        badge(c.status) +
        "</td>" +
        '<td><a style="font-size:12px;color:var(--accent);text-decoration:none" href="#/candidates/' +
        esc(c.id) +
        '" aria-label="View ' +
        esc(c.name) +
        '">View</a></td>' +
        "</tr>";
    });
    html += "</tbody></table>";
    table.innerHTML = html;
    var selAll = document.getElementById("selAll");
    selAll.addEventListener("change", function () {
      table.querySelectorAll(".rowsel").forEach(function (cb) {
        cb.checked = selAll.checked;
        var id = cb.getAttribute("data-id");
        if (selAll.checked) selected[id] = true;
        else delete selected[id];
      });
      updateBatchBar();
    });
    table.querySelectorAll(".rowsel").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var id = cb.getAttribute("data-id");
        if (cb.checked) selected[id] = true;
        else delete selected[id];
        updateBatchBar();
      });
    });
  }

  function renderPager() {
    var el = document.getElementById("pager");
    if (total <= pageSize) {
      el.innerHTML = "";
      return;
    }
    var from = (page - 1) * pageSize + 1;
    var to = Math.min(page * pageSize, total);
    var maxPage = Math.max(1, Math.ceil(total / pageSize));
    el.innerHTML =
      '<button type="button" class="pager-btn" id="pgPrev"' +
      (page <= 1 ? " disabled" : "") +
      ' aria-label="Previous page">Prev</button>' +
      '<span class="pager-info">' +
      from +
      "&ndash;" +
      to +
      " of " +
      total +
      "</span>" +
      '<button type="button" class="pager-btn" id="pgNext"' +
      (page >= maxPage ? " disabled" : "") +
      ' aria-label="Next page">Next</button>';
    document.getElementById("pgPrev").addEventListener("click", function () {
      if (page > 1) {
        page--;
        load();
      }
    });
    document.getElementById("pgNext").addEventListener("click", function () {
      if (page < maxPage) {
        page++;
        load();
      }
    });
  }

  async function load() {
    var table = document.getElementById("ctable");
    try {
      var url =
        "/api/candidates?limit=" +
        pageSize +
        "&offset=" +
        (page - 1) * pageSize;
      if (statusQ) url += "&status=" + encodeURIComponent(statusQ);
      if (searchQ) url += "&q=" + encodeURIComponent(searchQ);
      var data = await api(url);
      var rows = data.candidates || [];
      total = data.total || 0;
      var maxPage = Math.max(1, Math.ceil(total / pageSize));
      if (page > maxPage) {
        page = maxPage;
        return load();
      }
      renderTable(rows);
      renderPager();
    } catch (e) {
      table.innerHTML =
        '<div style="padding:28px;text-align:center;color:var(--bad);font-size:13px">' +
        esc(e.message || "Failed to load candidates") +
        "</div>";
    }
  }

  async function parseDoc() {
    var text = document.getElementById("resumeText").value.trim();
    if (!text) {
      toast("Paste or upload resume text first", "error");
      return;
    }
    var btn = document.getElementById("parseBtn");
    btn.disabled = true;
    btn.textContent = "Parsing...";
    try {
      var data = await api("/api/candidates/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text }),
      });
      var ex = data.extraction || {};
      if (ex.name) document.getElementById("draftName").value = ex.name;
      if (ex.email) document.getElementById("draftEmail").value = ex.email;
      var recs = data.recommendations || [];
      var sel = document.getElementById("draftRole");
      sel.innerHTML = '<option value="">&mdash; select role &mdash;</option>';
      recs.forEach(function (m, i) {
        sel.innerHTML +=
          '<option value="' +
          esc(m.roleId) +
          (i === 0 ? '" selected' : '"') +
          ">" +
          esc(m.title) +
          (m.score > 0 ? " (" + m.score + ")" : "") +
          "</option>";
      });
      var why = document.getElementById("draftWhy");
      if (!recs.length) {
        why.innerHTML =
          "No roles defined yet. Create a role on the Roles page first.";
      } else {
        var top = recs[0];
        var lines =
          (top.reasons || []).length > 0
            ? top.reasons
                .map(function (r) {
                  return esc(r);
                })
                .join("<br>")
            : "No strong keyword match &mdash; pick the closest role.";
        why.innerHTML =
          '<strong style="color:var(--text)">Top: ' +
          esc(top.title) +
          "</strong><br>" +
          lines;
      }
      var pii = (data.pii || []).length ? data.pii.join(", ") : "none";
      toast(
        "Parsed: " +
          (ex.name || "name not detected") +
          " | PII flagged: " +
          pii,
        "success",
      );
    } catch (e) {
      toast(e.message || "Parse failed", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Parse & Recommend";
    }
  }

  async function createCandidate() {
    var name = document.getElementById("draftName").value.trim();
    var email = document.getElementById("draftEmail").value.trim();
    var roleId = document.getElementById("draftRole").value;
    var resumeText = document.getElementById("resumeText").value;
    if (!name || !email || !roleId) {
      toast("Name, email and role are required", "error");
      return;
    }
    var btn = document.getElementById("createBtn");
    btn.disabled = true;
    btn.textContent = "Creating...";
    try {
      var data = await api("/api/candidates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roleId: roleId,
          name: name,
          email: email,
          resumeText: resumeText,
        }),
      });
      var c = data.candidate || {};
      toast("Created " + name + " | status: " + c.status, "success");
      document.getElementById("resumeText").value = "";
      document.getElementById("draftName").value = "";
      document.getElementById("draftEmail").value = "";
      document.getElementById("draftRole").selectedIndex = 0;
      document.getElementById("draftWhy").innerHTML =
        "Parse a document to see recommendations.";
      page = 1;
      await Promise.all([load(), loadStats()]);
    } catch (e) {
      toast(e.message || "Create failed", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Create Candidate";
    }
  }

  async function batchReview(approved) {
    var ids = Object.keys(selected);
    if (!ids.length) return;
    try {
      var data = await api("/api/candidates/batch/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: ids, approved: approved }),
      });
      toast(
        (approved ? "Approved " : "Rejected ") +
          data.done +
          " candidate(s)" +
          (data.failed ? " (" + data.failed + " skipped)" : ""),
        data.failed ? "error" : "success",
      );
      selected = {};
      updateBatchBar();
      await Promise.all([load(), loadStats()]);
    } catch (e) {
      toast(e.message || "Batch review failed", "error");
    }
  }

  async function batchDelete() {
    var ids = Object.keys(selected);
    if (!ids.length) return;
    if (!window.confirm("Delete " + ids.length + " candidate(s)?")) return;
    try {
      var data = await api("/api/candidates/batch/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: ids }),
      });
      toast(
        "Deleted " +
          data.done +
          " candidate(s)" +
          (data.failed
            ? " (" + data.failed + " skipped, e.g. open disputes)"
            : ""),
        data.failed ? "error" : "success",
      );
      selected = {};
      updateBatchBar();
      await Promise.all([load(), loadStats()]);
    } catch (e) {
      toast(e.message || "Batch delete failed", "error");
    }
  }

  function readFileInto(file) {
    var name = file.name || "";
    var lower = name.toLowerCase();
    if (lower.endsWith(".pdf") || lower.endsWith(".docx")) {
      var fr = new FileReader();
      fr.onload = function () {
        var dataUrl = String(fr.result || "");
        var base64 = dataUrl.split(",")[1] || "";
        extractFromDocument(name, base64);
      };
      fr.readAsDataURL(file);
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      document.getElementById("resumeText").value = String(reader.result || "");
      toast("Loaded " + name, "success");
    };
    reader.readAsText(file);
  }
  async function extractFromDocument(filename, base64) {
    toast("Extracting text from " + filename + "\u2026", "info");
    try {
      var data = await api("/api/candidates/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: filename, contentBase64: base64 }),
      });
      document.getElementById("resumeText").value = data.text || "";
      var ex = data.extraction || {};
      if (ex.name) document.getElementById("draftName").value = ex.name;
      if (ex.email) document.getElementById("draftEmail").value = ex.email;
      var recs = data.recommendations || [];
      var sel = document.getElementById("draftRole");
      sel.innerHTML = '<option value="">&mdash; select role &mdash;</option>';
      recs.forEach(function (m, i) {
        sel.innerHTML +=
          '<option value="' +
          esc(m.roleId) +
          (i === 0 ? '" selected' : '"') +
          ">" +
          esc(m.title) +
          (m.score > 0 ? " (" + m.score + ")" : "") +
          "</option>";
      });
      var why = document.getElementById("draftWhy");
      if (!recs.length) {
        why.innerHTML =
          "No roles defined yet. Create a role on the Roles page first.";
      } else {
        var top = recs[0];
        var lines =
          (top.reasons || []).length > 0
            ? top.reasons
                .map(function (r) {
                  return esc(r);
                })
                .join("<br>")
            : "No strong keyword match &mdash; pick the closest role.";
        why.innerHTML =
          '<strong style="color:var(--text)">Top: ' +
          esc(top.title) +
          "</strong><br>" +
          lines;
      }
      var pii = (data.pii || []).length ? data.pii.join(", ") : "none";
      toast(
        "Parsed " +
          filename +
          ": " +
          (ex.name || "name not detected") +
          " | PII flagged: " +
          pii,
        "success",
      );
    } catch (e) {
      toast(e.message || "Document extraction failed", "error");
    }
  }

  var fileInput = document.getElementById("resumeFile");
  fileInput.addEventListener("change", function () {
    var f = fileInput.files && fileInput.files[0];
    if (f) readFileInto(f);
  });
  var dz = document.getElementById("dropZone");
  dz.addEventListener("dragover", function (e) {
    e.preventDefault();
    dz.style.borderColor = "var(--accent)";
  });
  dz.addEventListener("dragleave", function () {
    dz.style.borderColor = "var(--border)";
  });
  dz.addEventListener("drop", function (e) {
    e.preventDefault();
    dz.style.borderColor = "var(--border)";
    var f =
      e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) readFileInto(f);
  });

  document
    .getElementById("parseBtn")
    .addEventListener("click", parseDoc);
  document
    .getElementById("createBtn")
    .addEventListener("click", createCandidate);
  document
    .getElementById("batchApprove")
    .addEventListener("click", function () {
      batchReview(true);
    });
  document
    .getElementById("batchReject")
    .addEventListener("click", function () {
      batchReview(false);
    });
  document
    .getElementById("batchDelete")
    .addEventListener("click", batchDelete);
  document
    .getElementById("exportCsvBtn")
    .addEventListener("click", function () {
      location.href = "/api/csv/export";
    });

  await loadRoles();
  await loadStats();
  await load();
};;

window.render_roles = async function () {
  nav("roles");
  var editingId = null;
  var cache = [];

  function lbl(id, text) {
    return '<label for="' + id + '" style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px">' + text + "</label>";
  }
  function num(v) {
    if (v === "" || v === null || v === undefined) return undefined;
    var n = parseFloat(v);
    return isFinite(n) ? n : undefined;
  }
  function curSym(c) {
    return { USD: "$", EUR: "€", GBP: "£", INR: "₹" }[c || "USD"] || "";
  }
  function shortNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + "M";
    if (n >= 1000) return Math.round(n / 1000) + "k";
    return String(n);
  }
  function fmtBudget(r) {
    var hasMin = typeof r.budgetMin === "number";
    var hasMax = typeof r.budgetMax === "number";
    if (!hasMin && !hasMax) return "—";
    var sym = curSym(r.budgetCurrency);
    if (hasMin && hasMax) {
      return r.budgetMin === r.budgetMax
        ? sym + shortNum(r.budgetMin)
        : sym + shortNum(r.budgetMin) + "–" + sym + shortNum(r.budgetMax);
    }
    return hasMin ? sym + shortNum(r.budgetMin) + "+" : "up to " + sym + shortNum(r.budgetMax);
  }
  function fmtExp(r) {
    var hasMin = typeof r.experienceMinYears === "number";
    var hasMax = typeof r.experienceMaxYears === "number";
    if (!hasMin && !hasMax) return "—";
    if (hasMin && hasMax) {
      return r.experienceMinYears === r.experienceMaxYears
        ? r.experienceMinYears + " yr"
        : r.experienceMinYears + "–" + r.experienceMaxYears + " yrs";
    }
    return hasMin ? r.experienceMinYears + "+ yrs" : "up to " + r.experienceMaxYears + " yrs";
  }
  function chips(arr, max) {
    var list = (arr || []).filter(Boolean);
    if (!list.length) return '<span style="color:var(--muted);font-size:12px">—</span>';
    var shown = list.slice(0, max || list.length);
    var out = shown
      .map(function (x) {
        return '<span class="tag">' + esc(x) + "</span>";
      })
      .join("");
    if (list.length > shown.length) {
      out += '<span class="tag" title="' + esc(list.slice(shown.length).join(", ")) + '">+' + (list.length - shown.length) + "</span>";
    }
    return out;
  }

  appEl.innerHTML =
    '<h1>Roles</h1>' +
    '<div class="card section-gap collapsible">' +
    '<button class="collapsible-header" aria-expanded="false" aria-controls="roleFormBody">' +
    '<span class="arrow" aria-hidden="true">▶</span><span id="roleFormTitle">Create Role</span></button>' +
    '<div class="collapsible-body" id="roleFormBody">' +
    '<form id="roleform" class="form-grid">' +
    "<div>" + lbl("rf-title", "Role title") + '<input id="rf-title" name="title" class="input" placeholder="e.g. Senior Frontend Engineer" aria-label="Role title" required /></div>' +
    "<div>" + lbl("rf-skills", "Required skills (comma separated)") + '<input id="rf-skills" name="skills" class="input" placeholder="React, TypeScript, AWS" aria-label="Required skills, comma separated" /></div>' +
    '<div class="form-row">' +
    "<div>" + lbl("rf-emin", "Experience min (years)") + '<input id="rf-emin" name="experienceMinYears" class="input" type="number" min="0" max="60" step="1" aria-label="Minimum experience in years" /></div>' +
    "<div>" + lbl("rf-emax", "Experience max (years)") + '<input id="rf-emax" name="experienceMaxYears" class="input" type="number" min="0" max="60" step="1" aria-label="Maximum experience in years" /></div>' +
    "</div>" +
    '<div class="form-row">' +
    "<div>" + lbl("rf-bmin", "Client budget min") + '<input id="rf-bmin" name="budgetMin" class="input" type="number" min="0" step="1000" aria-label="Client budget minimum" /></div>' +
    "<div>" + lbl("rf-bmax", "Client budget max") + '<input id="rf-bmax" name="budgetMax" class="input" type="number" min="0" step="1000" aria-label="Client budget maximum" /></div>' +
    "</div>" +
    "<div>" + lbl("rf-cur", "Budget currency") + '<select id="rf-cur" name="budgetCurrency" class="input" aria-label="Budget currency"><option value="USD">USD $</option><option value="EUR">EUR €</option><option value="GBP">GBP £</option><option value="INR">INR ₹</option></select></div>' +
    "<div>" + lbl("rf-reqs", "Requirements (one per line)") + '<textarea id="rf-reqs" name="requirements" placeholder="5+ years with React" aria-label="Requirements, one per line" required></textarea></div>' +
    "<div>" + lbl("rf-nice", "Nice to have (one per line)") + '<textarea id="rf-nice" name="niceToHave" placeholder="GraphQL" aria-label="Nice to have, one per line"></textarea></div>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap"><button type="submit" class="btn primary" id="roleSubmit">Create Role</button><button type="button" class="btn" id="roleCancel" style="display:none">Cancel Edit</button></div>' +
    "</form></div></div>" +
    '<div class="card" id="rlist"><div class="loading" role="status" aria-busy="true">Loading…</div></div>';

  var list = document.getElementById("rlist");
  var cancelBtn = document.getElementById("roleCancel");

  function exitEdit() {
    editingId = null;
    document.getElementById("roleFormTitle").textContent = "Create Role";
    document.getElementById("roleSubmit").textContent = "Create Role";
    cancelBtn.style.display = "none";
  }

  async function load() {
    try {
      var data = await api("/api/roles");
      cache = data.roles || [];
      if (!cache.length) {
        list.innerHTML = '<div class="empty">No roles yet — create the first role above.</div>';
        return;
      }
      var rows = "";
      cache.forEach(function (r) {
        rows +=
          "<tr>" +
          '<td style="font-weight:600">' + esc(r.title) + (r.updatedAt ? ' <span class="tag" title="Edited">edited</span>' : "") + "</td>" +
          "<td>" + chips(r.skills, 4) + "</td>" +
          "<td>" + fmtExp(r) + "</td>" +
          "<td>" + fmtBudget(r) + "</td>" +
          "<td>" + chips(r.requirements, 3) + "</td>" +
          "<td style=\\"font-size:12px;color:var(--muted)\\">" + fmtDate(r.createdAt) + "</td>" +
          '<td><button class="btn" data-edit-role="' + esc(r.id) + '" aria-label="Edit role ' + esc(r.title) + '">Edit</button></td>' +
          "</tr>";
      });
      list.innerHTML =
        '<table aria-label="Roles"><thead><tr><th scope="col">Title</th><th scope="col">Skills</th><th scope="col">Experience</th><th scope="col">Client budget</th><th scope="col">Requirements</th><th scope="col">Created</th><th scope="col">Actions</th></tr></thead><tbody>' +
        rows +
        "</tbody></table>";
    } catch (e) {
      list.innerHTML = '<div class="empty" role="alert">' + esc(e.message) + "</div>";
    }
  }

  list.addEventListener("click", function (e) {
    var b = e.target.closest("[data-edit-role]");
    if (!b) return;
    var id = b.getAttribute("data-edit-role");
    var r = cache.filter(function (x) {
      return x.id === id;
    })[0];
    if (!r) return;
    editingId = r.id;
    document.getElementById("roleFormTitle").textContent = "Edit Role";
    document.getElementById("roleSubmit").textContent = "Save Changes";
    cancelBtn.style.display = "";
    document.getElementById("rf-title").value = r.title || "";
    document.getElementById("rf-skills").value = (r.skills || []).join(", ");
    document.getElementById("rf-emin").value = typeof r.experienceMinYears === "number" ? r.experienceMinYears : "";
    document.getElementById("rf-emax").value = typeof r.experienceMaxYears === "number" ? r.experienceMaxYears : "";
    document.getElementById("rf-bmin").value = typeof r.budgetMin === "number" ? r.budgetMin : "";
    document.getElementById("rf-bmax").value = typeof r.budgetMax === "number" ? r.budgetMax : "";
    document.getElementById("rf-cur").value = r.budgetCurrency || "USD";
    document.getElementById("rf-reqs").value = (r.requirements || []).join("\\n");
    document.getElementById("rf-nice").value = (r.niceToHave || []).join("\\n");
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.getElementById("rf-title").focus();
  });

  cancelBtn.addEventListener("click", function () {
    exitEdit();
    document.getElementById("roleform").reset();
  });

  document.getElementById("roleform").addEventListener("submit", async function (e) {
    e.preventDefault();
    var fd = new FormData(e.target);
    var lines = function (v) {
      return String(v || "")
        .split("\\n")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
    };
    var payload = {
      title: String(fd.get("title") || "").trim(),
      requirements: lines(fd.get("requirements")),
      niceToHave: lines(fd.get("niceToHave")),
      skills: String(fd.get("skills") || "")
        .split(",")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean),
      budgetCurrency: fd.get("budgetCurrency") || "USD",
    };
    var emin = num(fd.get("experienceMinYears"));
    var emax = num(fd.get("experienceMaxYears"));
    var bmin = num(fd.get("budgetMin"));
    var bmax = num(fd.get("budgetMax"));
    if (emin !== undefined) payload.experienceMinYears = emin;
    if (emax !== undefined) payload.experienceMaxYears = emax;
    if (bmin !== undefined) payload.budgetMin = bmin;
    if (bmax !== undefined) payload.budgetMax = bmax;
    try {
      if (editingId) {
        await api("/api/roles/" + encodeURIComponent(editingId), {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast("Role updated", "success");
      } else {
        await api("/api/roles", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast("Role created", "success");
      }
      e.target.reset();
      exitEdit();
      load();
    } catch (err) {
      toast(err.message, "error");
    }
  });

  load();
};;

window.render_disputes=async function(){nav('disputes');appEl.innerHTML='<h1>Disputes</h1><div class="card" id="dtable"><div class="loading" role="status" aria-busy="true">Loading…</div></div>';var el=document.getElementById('dtable');try{var data=await api('/api/candidates');var withDispute=data.candidates.filter(function(c){return c.dispute;});if(!withDispute.length){el.innerHTML='<div class="empty">No disputes found.</div>';return;}var rows='';withDispute.forEach(function(c){var d=c.dispute;var isOpen=!d.resolvedAt;rows+='<tr><td><a href="#/candidate/'+esc(c.id)+'">'+esc(c.name)+'</a></td><td>'+badge(c.status)+'</td><td>'+esc(d.note||'—')+'</td><td>'+fmtDate(d.raisedAt)+'</td><td>'+(isOpen?'<button class="ghost ds-resolve" data-id="'+esc(c.id)+'" aria-label="Resolve dispute for '+esc(c.name)+'">Resolve</button>':badge('resolved'))+'</td></tr>';});el.innerHTML='<table aria-label="Disputed candidates"><thead><tr><th scope="col">Candidate</th><th scope="col">Status</th><th scope="col">Note</th><th scope="col">Raised</th><th scope="col">Action</th></tr></thead><tbody>'+rows+'</tbody></table>';el.querySelectorAll('.ds-resolve').forEach(function(btn){btn.addEventListener('click',async function(){try{await api('/api/candidates/'+btn.dataset.id+'/dispute/resolve',{method:'POST'});toast('Dispute resolved','success');render_disputes();}catch(err){toast(err.message,'error');}});});}catch(e){el.innerHTML='<div class="empty" role="alert">'+esc(e.message)+'</div>';}};

window.render_outbox=async function(){nav('outbox');appEl.innerHTML='<h1>Outbox</h1><div class="card-grid"><div class="card kpi info"><div class="value" id="obcount">—</div><div class="label">Pending Events</div></div></div><div class="card section-gap"><h2>Dispatch</h2><p class="empty" style="text-align:left;padding:0 0 10px">Manually flush pending candidate notifications (AI notices, status emails).</p><div style="display:flex;gap:8px"><button class="primary" id="obdispatch" aria-label="Dispatch all pending outbox events">Dispatch All</button><button class="ghost" id="obcleanup" aria-label="Run retention cleanup">Run Retention Cleanup</button></div></div><div class="card" id="obtable"><div class="loading" role="status" aria-busy="true">Loading…</div></div>';var el=document.getElementById('obtable');async function load(){try{var data=await api('/api/outbox');var events=data.events||[];var cc=document.getElementById('obcount');if(cc)cc.textContent=events.length;if(!events.length){el.innerHTML='<div class="empty">Outbox is empty.</div>';return;}var rows='';events.forEach(function(ev){var payload=ev.payload||{};rows+='<tr><td>'+badge(ev.type)+'</td><td>'+esc(payload.name||'—')+'</td><td style="font-size:12px;color:var(--muted)">'+esc(payload.email||'')+'</td><td style="font-size:12px;color:var(--muted)">'+fmtDate(ev.at)+'</td></tr>';});el.innerHTML='<table aria-label="Pending outbox events"><thead><tr><th scope="col">Type</th><th scope="col">Candidate</th><th scope="col">Email</th><th scope="col">Queued At</th></tr></thead><tbody>'+rows+'</tbody></table>';}catch(e){el.innerHTML='<div class="empty" role="alert">'+esc(e.message)+'</div>';}}load();var db=document.getElementById('obdispatch');if(db)db.addEventListener('click',async function(){db.disabled=true;try{var r=await api('/api/outbox/dispatch',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});toast('Dispatched '+r.dispatched+' event(s)','success');load();}catch(e){toast(e.message,'error');}finally{db.disabled=false;}});var cl=document.getElementById('obcleanup');if(cl)cl.addEventListener('click',async function(){cl.disabled=true;try{var r=await api('/api/retention/cleanup',{method:'POST'});toast('Retention cleanup complete','success');load();}catch(e){toast(e.message,'error');}finally{cl.disabled=false;}});};

window.render_audit=async function(){nav('audit');appEl.innerHTML='<h1>Audit Trail</h1><div class="search-bar"><input id="afilter" placeholder="Filter by action…" aria-label="Filter audit events by action" /></div><div class="card" id="atable"><div class="loading" role="status" aria-busy="true">Loading…</div></div>';var allEvents=[];async function load(){var el=document.getElementById('atable');try{var data=await api('/api/audit');allEvents=data.events||[];render(allEvents);}catch(e){el.innerHTML='<div class="empty" role="alert">'+esc(e.message)+'</div>';}}function render(events){var el=document.getElementById('atable');if(!events.length){el.innerHTML='<div class="empty">No audit events.</div>';return;}var rows='';events.forEach(function(ev){rows+='<tr><td><span class="action">'+esc(ev.action)+'</span></td><td style="font-size:11px;color:var(--muted)">'+fmtDate(ev.at)+'</td><td><button class="ghost a-expand" data-detail="'+esc(JSON.stringify(ev.detail||null))+'" aria-expanded="false" aria-label="View detail for '+esc(ev.action)+'">View</button></td></tr>';});el.innerHTML='<table aria-label="Audit events"><thead><tr><th scope="col">Action</th><th scope="col">Time</th><th scope="col">Detail</th></tr></thead><tbody>'+rows+'</tbody></table>';el.querySelectorAll('.a-expand').forEach(function(btn){btn.addEventListener('click',function(){var d=btn.dataset.detail;var pre=btn.closest('td').querySelector('pre');if(pre){pre.remove();btn.setAttribute('aria-expanded','false');return;}var nd=document.createElement('td');nd.innerHTML='<pre style="margin-top:4px">'+esc(d)+'</pre>';btn.closest('tr').appendChild(nd);btn.setAttribute('aria-expanded','true');});});}document.getElementById('afilter').addEventListener('input',function(e){var q=e.target.value.toLowerCase();if(!q){render(allEvents);return;}render(allEvents.filter(function(ev){return ev.action.toLowerCase().indexOf(q)!==-1;}));});load();};

window.render_ai_usage=async function(){nav('ai-usage');appEl.innerHTML='<h1>AI Usage</h1><div class="loading" role="status" aria-busy="true">Loading…</div>';try{var report=await api('/api/telemetry');var u=report.usage||{};var kpis='';kpis+='<div class="card kpi info"><div class="value">'+(u.calls||0)+'</div><div class="label">Total Calls</div></div>';kpis+='<div class="card kpi"><div class="value">'+(u.inputTokens||0).toLocaleString()+'</div><div class="label">Input Tokens</div></div>';kpis+='<div class="card kpi"><div class="value">'+(u.outputTokens||0).toLocaleString()+'</div><div class="label">Output Tokens</div></div>';kpis+='<div class="card kpi accent"><div class="value">$'+(u.estCostUsd||0).toFixed(4)+'</div><div class="label">Est. Cost (USD)</div></div>';var modelTable='';var models=u.byModel||{};var keys=Object.keys(models);if(keys.length){modelTable+='<h2>By Model</h2><div class="card"><table aria-label="AI usage by model"><thead><tr><th scope="col">Model</th><th scope="col">Calls</th><th scope="col">Input</th><th scope="col">Output</th><th scope="col">Cost</th></tr></thead><tbody>';keys.forEach(function(k){var m=models[k];modelTable+='<tr><td>'+esc(k)+'</td><td>'+m.calls+'</td><td>'+m.inputTokens.toLocaleString()+'</td><td>'+m.outputTokens.toLocaleString()+'</td><td>$'+m.estCostUsd.toFixed(4)+'</td></tr>';});modelTable+='</tbody></table></div>';}var pipelineTable='';var pc=report.pipeline||{};var pk=Object.keys(pc);if(pk.length){pipelineTable+='<h2>Pipeline Counters</h2><div class="card"><table aria-label="Pipeline counters"><thead><tr><th scope="col">Metric</th><th scope="col">Count</th></tr></thead><tbody>';pk.forEach(function(k){pipelineTable+='<tr><td>'+esc(k)+'</td><td>'+pc[k]+'</td></tr>';});pipelineTable+='</tbody></table></div>';}appEl.innerHTML='<h1>AI Usage</h1><div class="card-grid">'+kpis+'</div>'+modelTable+pipelineTable||'';}catch(e){appEl.innerHTML='<h1>AI Usage</h1><div class="card empty" role="alert">'+esc(e.message)+'</div>';}};

window.render_runbooks=async function(){nav('runbooks');appEl.innerHTML='<h1>Runbooks</h1><div class="search-bar"><input id="rbkey" placeholder="Runbook key (e.g. dsra-1)" aria-label="Runbook key" /><button class="primary" id="rbload" aria-label="Load runbook">Load</button></div><div class="card" id="rbcontent"><div class="empty">Enter a runbook key to view its content.</div></div>';document.getElementById('rbload').addEventListener('click',loadRb);document.getElementById('rbkey').addEventListener('keydown',function(e){if(e.key==='Enter')loadRb();});async function loadRb(){var key=document.getElementById('rbkey').value.trim();if(!key)return;var el=document.getElementById('rbcontent');el.innerHTML='<div class="loading" role="status" aria-busy="true">Loading…</div>';try{var res=await fetch('/api/runbooks/'+encodeURIComponent(key));if(!res.ok)throw new Error('Not found');var text=await res.text();el.innerHTML='<pre style="white-space:pre-wrap;line-height:1.6">'+esc(text)+'</pre>';}catch(e){el.innerHTML='<div class="empty" role="alert">Runbook "'+esc(key)+'" not found.</div>';}}};

window.render_scorecards = async function () {
  nav("scorecards");
  var editingId = null;
  var scCache = [];
  var QS = ["technical", "communication", "culture"];
  appEl.innerHTML =
    '<h1>Scorecards</h1><div class="card section-gap"><h2 id="scformtitle">New Scorecard</h2><form id="scform" class="form-grid"><div class="form-row"><label for="sccand">Candidate</label><select id="sccand" aria-label="Candidate"><option>Loading…</option></select></div><div class="form-row"><label for="screv">Reviewer Name</label><input id="screv" placeholder="reviewer@dsrvm" aria-label="Reviewer name" /></div><div class="form-row"><label for="scq1">Technical (1-5)</label><input id="scq1" type="number" min="1" max="5" value="3" aria-label="Technical score" /></div><div class="form-row"><label for="scq2">Communication (1-5)</label><input id="scq2" type="number" min="1" max="5" value="3" aria-label="Communication score" /></div><div class="form-row"><label for="scq3">Culture Fit (1-5)</label><input id="scq3" type="number" min="1" max="5" value="3" aria-label="Culture fit score" /></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="primary" type="submit" id="scsubmit">Submit Scorecard</button><button type="button" class="btn" id="sccancel" style="display:none">Cancel Edit</button></div></form></div><div class="card" id="sclist"><div class="loading" role="status" aria-busy="true">Loading…</div></div>';

  function exitEdit() {
    editingId = null;
    var sel = document.getElementById("sccand");
    if (sel) sel.disabled = false;
    document.getElementById("scformtitle").textContent = "New Scorecard";
    document.getElementById("scsubmit").textContent = "Submit Scorecard";
    document.getElementById("sccancel").style.display = "none";
  }

  async function loadSc() {
    try {
      var cd = await api("/api/candidates");
      var cands = cd.candidates || [];
      var sel = document.getElementById("sccand");
      if (sel && !sel.disabled) {
        var opts = '<option value="">Select candidate…</option>';
        cands.forEach(function (c) {
          opts += '<option value="' + esc(c.id) + '">' + esc(c.name) + " (" + esc(c.email) + ")</option>";
        });
        sel.innerHTML = opts;
      }
      var sd = await api("/api/scorecards");
      var scs = sd.scorecards || [];
      scCache = scs;
      var list = document.getElementById("sclist");
      if (!scs.length) {
        list.innerHTML = '<div class="empty">No scorecards yet. Submit the first one above.</div>';
        return;
      }
      var nameMap = {};
      cands.forEach(function (c) {
        nameMap[c.id] = c.name;
      });
      var rows = "";
      scs.forEach(function (sc) {
        var cname = nameMap[sc.candidateId] || sc.candidateId;
        rows +=
          "<tr><td>" +
          esc(cname) +
          "</td><td>" +
          esc(sc.reviewerName) +
          '</td><td class="' +
          (sc.overallScore >= 70 ? "high" : sc.overallScore >= 40 ? "mid" : "low") +
          '" title="Overall score">' +
          sc.overallScore.toFixed(1) +
          '</td><td style="font-size:12px;color:var(--muted)">' +
          fmtDate(sc.createdAt) +
          "</td>" +
          '<td><button class="btn" data-edit-sc="' +
          esc(sc.id) +
          '" aria-label="Edit scorecard for ' +
          esc(cname) +
          '">Edit</button></td></tr>';
      });
      list.innerHTML =
        '<table aria-label="Submitted scorecards"><thead><tr><th scope="col">Candidate</th><th scope="col">Reviewer</th><th scope="col">Overall</th><th scope="col">Created</th><th scope="col">Actions</th></tr></thead><tbody>' +
        rows +
        "</tbody></table>";
    } catch (e) {
      var l = document.getElementById("sclist");
      if (l) l.innerHTML = '<div class="empty" role="alert">' + esc(e.message) + "</div>";
    }
  }

  document.getElementById("sclist").addEventListener("click", function (e) {
    var b = e.target.closest("[data-edit-sc]");
    if (!b) return;
    var id = b.getAttribute("data-edit-sc");
    var sc = scCache.filter(function (x) {
      return x.id === id;
    })[0];
    if (!sc) return;
    editingId = sc.id;
    var sel = document.getElementById("sccand");
    if (sel) {
      var found = false;
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === sc.candidateId) {
          found = true;
          break;
        }
      }
      if (!found) {
        sel.innerHTML += '<option value="' + esc(sc.candidateId) + '">' + esc(sc.candidateId) + "</option>";
      }
      sel.value = sc.candidateId;
      sel.disabled = true;
    }
    document.getElementById("screv").value = sc.reviewerName || "";
    var byQ = {};
    (sc.answers || []).forEach(function (a) {
      byQ[a.questionId] = a;
    });
    QS.forEach(function (q, i) {
      var el = document.getElementById("scq" + (i + 1));
      if (el && byQ[q]) el.value = byQ[q].score;
    });
    document.getElementById("scformtitle").textContent = "Edit Scorecard";
    document.getElementById("scsubmit").textContent = "Save Changes";
    document.getElementById("sccancel").style.display = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.getElementById("screv").focus();
  });

  document.getElementById("sccancel").addEventListener("click", function () {
    exitEdit();
    var f = document.getElementById("scform");
    if (f) f.reset();
    loadSc();
  });

  var rform = document.getElementById("scform");
  if (rform)
    rform.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var cid = document.getElementById("sccand").value;
      var rev = document.getElementById("screv").value.trim();
      var scores = [1, 2, 3].map(function (i) {
        return parseInt(document.getElementById("scq" + i).value, 10);
      });
      var bad = scores.filter(function (s) {
        return !isFinite(s) || s < 1 || s > 5;
      });
      if (bad.length) {
        toast("Scores must be between 1 and 5", "error");
        return;
      }
      if (!cid) {
        toast("Please select a candidate", "error");
        return;
      }
      if (!rev) {
        toast("Reviewer name required", "error");
        return;
      }
      var existing = {};
      if (editingId) {
        var sc = scCache.filter(function (x) {
          return x.id === editingId;
        })[0];
        if (sc) {
          (sc.answers || []).forEach(function (a) {
            existing[a.questionId] = a;
          });
        }
      }
      var answers = QS.map(function (q, i) {
        var a = { questionId: q, score: scores[i] };
        if (existing[q] && existing[q].comment) a.comment = existing[q].comment;
        return a;
      });
      try {
        if (editingId) {
          await api("/api/scorecards/" + encodeURIComponent(editingId), {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ reviewerName: rev, answers: answers }),
          });
          toast("Scorecard updated", "success");
        } else {
          await api("/api/scorecards", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ candidateId: cid, reviewerName: rev, answers: answers }),
          });
          toast("Scorecard submitted", "success");
        }
        ev.target.reset();
        exitEdit();
        loadSc();
      } catch (e) {
        toast(e.message, "error");
      }
    });

  loadSc();
};;

window.render_compare=async function(){nav('compare');appEl.innerHTML='<h1>Compare Candidates</h1><div class="search-bar"><select id="rolePick" style="width:auto" aria-label="Select role to compare"></select><input id="cfilter" placeholder="Filter by name..." aria-label="Filter candidates by name or email" /></div><div class="card" id="ctable"><div class="loading" role="status" aria-busy="true">Loading…</div></div>';try{var rdata=await api('/api/roles');var roles=rdata.roles||[];if(!roles.length){document.getElementById('ctable').innerHTML='<div class="empty">No roles yet — create a role first.</div>';return;}var rsel=document.getElementById('rolePick');roles.forEach(function(r,i){rsel.innerHTML+='<option value="'+esc(r.id)+'"'+(i===0?' selected':'')+'>'+esc(r.title)+'</option>';});var byId={};try{var cdata=await api('/api/candidates?limit=200');(cdata.candidates||[]).forEach(function(c){byId[c.id]=c;});}catch(e){}var ranked=[];var excluded=[];var roleTitle='';async function loadRank(){var rid=rsel.value;var el=document.getElementById('ctable');el.innerHTML='<div class="loading" role="status" aria-busy="true">Loading…</div>';try{var data=await api('/api/roles/'+encodeURIComponent(rid)+'/rank');ranked=data.ranked||[];excluded=data.excluded||[];roleTitle=data.roleTitle||rid;}catch(e){el.innerHTML='<div class="empty" role="alert">'+esc(e.message)+'</div>';return;}renderTable();}function renderTable(){var q=(document.getElementById('cfilter').value||'').toLowerCase();var rows=ranked.filter(function(r){return (r.name||'').toLowerCase().indexOf(q)!==-1||(r.email||'').toLowerCase().indexOf(q)!==-1;});var html='<h2 style="margin-bottom:12px">'+esc(roleTitle)+'</h2>';if(!rows.length){html+='<div class="empty">No candidates to compare.</div>';}else{html+='<table aria-label="Candidate comparison"><thead><tr><th scope="col">Rank</th><th scope="col">Name</th><th scope="col">Blended</th><th scope="col">Screening</th><th scope="col">Scorecard</th><th scope="col">Recommendation</th><th scope="col">AI</th></tr></thead><tbody>';rows.forEach(function(r){var rec=byId[r.candidateId];var scr=r.screeningScore!=null?r.screeningScore:'—';var sco=r.overallScore!=null?r.overallScore.toFixed(1):'—';var recV=rec&&rec.screening&&rec.screening.recommendation?rec.screening.recommendation:'—';html+='<tr><td>'+r.rank+'</td><td><a href="#/candidate/'+esc(r.candidateId)+'">'+esc(r.name)+'</a></td><td class="'+scoreClass(r.blendedScore)+'">'+r.blendedScore+'</td><td>'+scr+'</td><td>'+sco+'</td><td>'+esc(recV)+'</td><td>—</td></tr>';});html+='</tbody></table>';}if(excluded.length){html+='<h2 style="margin:16px 0 12px">Excluded</h2><table aria-label="Excluded candidates"><thead><tr><th scope="col">Name</th><th scope="col">Reason</th></tr></thead><tbody>';excluded.forEach(function(x){html+='<tr><td>'+esc(x.name)+'</td><td>'+esc(x.reason)+'</td></tr>';});html+='</tbody></table>';}document.getElementById('ctable').innerHTML=html;}rsel.addEventListener('change',loadRank);document.getElementById('cfilter').addEventListener('input',renderTable);await loadRank();}catch(e){document.getElementById('ctable').innerHTML='<div class="empty" role="alert">'+esc(e.message)+'</div>';}};

window.render_candidate=async function(id){nav('candidates');appEl.innerHTML='<div class="loading" role="status" aria-busy="true">Loading candidate…</div>';try{var data=await api('/api/candidates/'+id);var c=data.candidate;if(!c){appEl.innerHTML='<button type="button" class="back" onclick="location.hash=&apos;#/candidates&apos;">← Back</button><div class="card empty">Candidate not found.</div>';return;}var stepIdx=c.status==='pending_screening'?1:c.status==='pending_review'?2:3;var isRejected=c.status==='rejected';var stepper='<div class="stepper" role="group" aria-label="Pipeline progress"><div class="step'+(stepIdx>=1?' active':'')+'"><span class="dot" aria-hidden="true"></span>1. Screening</div><div class="step'+(stepIdx>=2?' active':'')+'"><span class="dot" aria-hidden="true"></span>2. Review</div><div class="step'+(stepIdx>=3?(isRejected?' active rej':' active done'):'')+'"><span class="dot" aria-hidden="true"></span>3. Decision'+(isRejected?' · Rejected':c.status==='approved'?' · Approved':'')+'</div></div>';var s=c.screening||{};var scoreV=s.score!=null?s.score:'—';var recV=s.recommendation||'—';var strengths=(s.strengths||[]).map(function(x){return '<span class="tag strength">'+esc(x)+'</span>';}).join('');var flags=(s.flags||[]).map(function(x){return '<span class="tag flag">'+esc(x)+'</span>';}).join('');var reviewSection='';if(c.review){reviewSection='<div class="detail-panel"><h3>Review Decision</h3><div style="margin-bottom:6px">'+badge(c.review.approved?'approved':'rejected')+' by <strong>'+esc(c.review.reviewer)+'</strong> at '+fmtDate(c.review.decidedAt)+'</div>'+(c.review.note?'<div style="color:var(--muted);font-size:13px">'+esc(c.review.note)+'</div>':'')+'</div>';}else{reviewSection='<div class="detail-panel"><h3>Review</h3><form id="reviewform" class="form-grid"><textarea name="note" placeholder="Reviewer note (optional)" aria-label="Reviewer note"></textarea><div style="display:flex;gap:8px"><button type="button" class="success" id="approveBtn" aria-label="Approve candidate">Approve</button><button type="button" class="danger" id="rejectBtn" aria-label="Reject candidate">Reject</button></div></form></div>';}var disputeSection='';if(c.dispute){var isOpen=!c.dispute.resolvedAt;disputeSection='<div class="detail-panel"><h3>Dispute '+(isOpen?badge('open'):badge('resolved'))+'</h3>'+(c.dispute.note?'<p style="margin:6px 0">'+esc(c.dispute.note)+'</p>':'')+'<p style="font-size:12px;color:var(--muted)">Raised '+fmtDate(c.dispute.raisedAt)+(c.dispute.resolvedAt?' • Resolved '+fmtDate(c.dispute.resolvedAt):'')+'</p>'+(isOpen?'<div style="margin-top:8px"><button class="ghost" id="resolveDispute" aria-label="Resolve dispute for this candidate">Resolve</button></div>':'')+'</div>';}else{disputeSection='<div class="detail-panel"><h3>Dispute</h3><p style="color:var(--muted);font-size:13px">No dispute raised.</p><div style="margin-top:8px"><button class="ghost" id="raiseDispute" aria-label="Raise dispute for this candidate">Raise Dispute</button></div></div>';}var noticeSection='<div class="detail-panel"><h3>AI Transparency Notice</h3><p style="font-size:13px">'+(c.aiNoticeDisclosedAt?'Disclosed at '+fmtDate(c.aiNoticeDisclosedAt):'<span style="color:var(--warn)">Not yet disclosed</span>')+'</p>'+(c.aiNoticeDisclosedAt?'':'<div style="margin-top:8px"><button class="ghost" id="discloseBtn" aria-label="Record AI notice disclosure">Record Disclosure</button></div>')+'</div>';appEl.innerHTML='<button type="button" class="back" onclick="location.hash=&apos;#/candidates&apos;">← Back to candidates</button>'+stepper+'<div class="detail-header"><div><h1>'+esc(c.name)+'</h1><div style="color:var(--muted);margin-bottom:16px;font-size:13px">'+esc(c.email)+'</div></div>'+badge(c.status)+'<div style="margin-left:auto"><button class="danger ghost" id="deleteCandidateBtn" aria-label="Delete candidate permanently">Delete</button></div></div><div class="detail-grid"><div class="detail-panel"><h3>Screening Result</h3><div class="score-ring '+scoreClass(scoreV)+'" style="margin:0 auto 8px" title="Screening score">'+scoreV+'</div><div style="text-align:center;margin-bottom:8px">'+badge(recV)+'</div><div style="color:var(--muted);font-size:13px;margin-bottom:8px">'+esc(s.summary||'—')+'</div>'+(strengths?'<div style="margin-bottom:6px"><strong style="font-size:12px;color:var(--muted)">Strengths</strong><br/>'+strengths+'</div>':'')+(flags?'<div><strong style="font-size:12px;color:var(--muted)">Flags</strong><br/>'+flags+'</div>':'')+'</div>'+reviewSection+'</div><div class="detail-grid">'+disputeSection+noticeSection+'</div><div class="detail-panel collapsible"><button class="collapsible-header" aria-expanded="false" aria-controls="candidateTimelineBody"><span class="arrow" aria-hidden="true">▶</span>Timeline</button><div class="collapsible-body" id="candidateTimelineBody"><div class="timeline" id="timeline"><div class="loading" role="status" aria-busy="true">Loading…</div></div></div></div>';if(document.getElementById('approveBtn')){document.getElementById('approveBtn').addEventListener('click',async function(){var note=document.querySelector('#reviewform [name=note]').value;try{await api('/api/candidates/'+id+'/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approved:true,reviewer:'reviewer@dsrvm',note:note||undefined})});toast('Candidate approved','success');render_candidate(id);}catch(e){toast(e.message,'error');}});}if(document.getElementById('rejectBtn')){document.getElementById('rejectBtn').addEventListener('click',async function(){var note=document.querySelector('#reviewform [name=note]').value;try{await api('/api/candidates/'+id+'/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approved:false,reviewer:'reviewer@dsrvm',note:note||undefined})});toast('Candidate rejected','success');render_candidate(id);}catch(e){toast(e.message,'error');}});}if(document.getElementById('raiseDispute')){document.getElementById('raiseDispute').addEventListener('click',async function(){var note=prompt('Dispute note (optional):');try{await api('/api/candidates/'+id+'/dispute',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({note:note||undefined})});toast('Dispute raised','success');render_candidate(id);}catch(e){toast(e.message,'error');}});}if(document.getElementById('resolveDispute')){document.getElementById('resolveDispute').addEventListener('click',async function(){try{await api('/api/candidates/'+id+'/dispute/resolve',{method:'POST'});toast('Dispute resolved','success');render_candidate(id);}catch(e){toast(e.message,'error');}});}if(document.getElementById('discloseBtn')){document.getElementById('discloseBtn').addEventListener('click',async function(){try{await api('/api/candidates/'+id+'/notice',{method:'POST'});toast('AI notice disclosure recorded','success');render_candidate(id);}catch(e){toast(e.message,'error');}});}if(document.getElementById('deleteCandidateBtn')){document.getElementById('deleteCandidateBtn').addEventListener('click',async function(){if(!confirm('Permanently delete this candidate?'))return;try{await api('/api/candidates/'+id,{method:'DELETE'});toast('Candidate deleted','success');location.hash='#/candidates';}catch(e){toast(e.message,'error');}});}var tl=document.getElementById('timeline');try{var adata=await api('/api/audit?candidateId='+encodeURIComponent(id));var events=adata.events||[];if(!events.length){tl.innerHTML='<div class="empty">No events yet.</div>';}else{var html='';events.sort(function(a,b){return a.at<b.at?1:-1;}).forEach(function(ev){html+='<div class="event"><div class="action">'+esc(ev.action)+'</div><div class="time">'+fmtDate(ev.at)+'</div></div>';});tl.innerHTML=html;}}catch(e){tl.innerHTML='<div class="empty" role="alert">'+esc(e.message)+'</div>';}}catch(e){appEl.innerHTML='<button type="button" class="back" onclick="location.hash=&apos;#/candidates&apos;">← Back</button><div class="card empty" role="alert">'+esc(e.message)+'</div>';}};

window.render_analytics=async function(){nav('analytics');appEl.innerHTML='<div class="loading" role="status" aria-busy="true">Loading…</div>';try{var r=await Promise.all([api('/api/stats').catch(function(){return{byStatus:{},disputes:{}};}),api('/api/candidates').catch(function(){return{candidates:[]};}),api('/api/roles').catch(function(){return{roles:[]};}),api('/api/audit').catch(function(){return{events:[]};}),api('/api/pipeline/summary').catch(function(){return{byStatus:{}};})]);var stats=r[0]||{};var cands=r[1].candidates||[];var roles=r[2].roles||[];var events=r[3].events||[];var pipe=r[4]||{};var bs=stats.byStatus||{};var dis=stats.disputes||{};var statuses=[['approved','Approved'],['pending_review','Pending Review'],['pending_screening','Pending Screening'],['rejected','Rejected']];var total=stats.total!=null?stats.total:cands.length;var kpis='';kpis+='<div class="card kpi accent"><div class="value">'+total+'</div><div class="label">Total Candidates</div></div>';kpis+='<div class="card kpi info"><div class="value">'+(bs.pending_review||0)+'</div><div class="label">Pending Review</div></div>';kpis+='<div class="card kpi ok"><div class="value">'+(bs.approved||0)+'</div><div class="label">Approved</div></div>';kpis+='<div class="card kpi bad"><div class="value">'+(bs.rejected||0)+'</div><div class="label">Rejected</div></div>';kpis+='<div class="card kpi '+(stats.avgScore!=null?scoreClass(stats.avgScore):'')+'"><div class="value">'+(stats.avgScore!=null?Math.round(stats.avgScore):'—')+'</div><div class="label">Avg Score</div></div>';kpis+='<div class="card kpi '+(((dis.raised||0)>(dis.resolved||0))?'warn':'ok')+'"><div class="value">'+(dis.raised||0)+'</div><div class="label">Disputes</div></div>';var maxStatus=0;statuses.forEach(function(s){maxStatus=Math.max(maxStatus,bs[s[0]]||0);});var bars='';statuses.forEach(function(s){var c=bs[s[0]]||0;var pct=total?Math.round(c/total*1000)/10:0;var w=maxStatus?Math.round(c/maxStatus*100):0;bars+='<div class="bar-row"><span class="bar-label">'+esc(s[1])+'</span><span class="bar-track"><span class="bar-fill '+s[0]+'" style="width:'+w+'%"></span></span><span class="bar-value">'+c+' ('+pct+'%)</span></div>';});var roleMap={};roles.forEach(function(ro){roleMap[ro.id]={title:ro.title,total:0,pending_review:0,approved:0,rejected:0,sum:0,n:0};});cands.forEach(function(c){var key=c.roleId||'__none__';var g=roleMap[key];if(!g){g={title:c.roleTitle||c.roleId||'Unassigned',total:0,pending_review:0,approved:0,rejected:0,sum:0,n:0};roleMap[key]=g;}g.total++;if(g[c.status]!=null)g[c.status]++;if(c.screening&&c.screening.score!=null){g.sum+=c.screening.score;g.n++;}});var roleRows='';Object.keys(roleMap).forEach(function(k){var g=roleMap[k];var avg=g.n?Math.round(g.sum/g.n):null;roleRows+='<tr><td>'+esc(g.title)+'</td><td>'+g.total+'</td><td>'+g.pending_review+'</td><td>'+g.approved+'</td><td>'+g.rejected+'</td><td class="'+(avg!=null?scoreClass(avg):'')+'">'+(avg!=null?avg:'—')+'</td></tr>';});var buckets=[['0-40','low',0,40],['40-60','mid',40,60],['60-80','mid',60,80],['80-100','high',80,101]];var hist=[0,0,0,0];cands.forEach(function(c){var sv=c.screening&&c.screening.score!=null?c.screening.score:null;if(sv==null)return;for(var bi=0;bi<buckets.length;bi++){if(sv>=buckets[bi][2]&&sv<buckets[bi][3]){hist[bi]++;return;}}hist[3]++;});var maxHist=Math.max(hist[0],hist[1],hist[2],hist[3])||1;var histHtml='<div class="histogram">';buckets.forEach(function(b,bi){var hp=Math.round(hist[bi]/maxHist*100);histHtml+='<div class="hist-bar"><span class="hist-count">'+hist[bi]+'</span><span class="hist-fill '+b[1]+'" style="height:'+Math.max(hp,2)+'%"></span><span class="hist-label">'+b[0]+'</span></div>';});histHtml+='</div>';var recent=events.slice().sort(function(a,b){return a.at<b.at?1:a.at>b.at?-1:0;}).slice(0,10);var tl='';if(!recent.length){tl='<div class="empty">No activity yet.</div>';}else{recent.forEach(function(ev){tl+='<div class="event"><div class="action">'+esc(ev.action)+'</div><div class="time">'+fmtDate(ev.at)+'</div></div>';});}var ph='';ph+='<div class="card kpi"><div class="value">'+(pipe.total!=null?pipe.total:total)+'</div><div class="label">Pipeline Total</div></div>';ph+='<div class="card kpi info"><div class="value">'+((pipe.avgScreeningTimeMs||0)/3600000).toFixed(1)+' h</div><div class="label">Avg Screening Time</div></div>';ph+='<div class="card kpi ok"><div class="value">'+(pipe.scorecardsSubmitted||0)+'</div><div class="label">Scorecards</div></div>';ph+='<div class="card kpi warn"><div class="value">'+(pipe.outboxPending!=null?pipe.outboxPending:stats.pendingOutbox||0)+'</div><div class="label">Outbox Pending</div></div>';var html='<h1>Analytics</h1><div class="card-grid">'+kpis+'</div>';html+='<div class="card section-gap"><h2>Status Distribution</h2><div class="bar-chart" role="img" aria-label="Candidate counts by status">'+bars+'</div></div>';html+='<div class="card section-gap"><h2>Role Breakdown</h2>'+(roleRows?'<table aria-label="Candidate breakdown by role"><thead><tr><th scope="col">Role</th><th scope="col">Candidates</th><th scope="col">Pending Review</th><th scope="col">Approved</th><th scope="col">Rejected</th><th scope="col">Avg Score</th></tr></thead><tbody>'+roleRows+'</tbody></table>':'<div class="empty">No roles yet.</div>')+'</div>';html+='<div class="card section-gap"><h2>Score Distribution</h2><div role="img" aria-label="Candidate count by screening score bucket">'+histHtml+'</div></div>';html+='<div class="card section-gap"><h2>Pipeline Health</h2><div class="card-grid">'+ph+'</div></div>';html+='<div class="card section-gap collapsible"><button class="collapsible-header" aria-expanded="false" aria-controls="recentActivityBody"><span class="arrow" aria-hidden="true">▶</span>Recent Activity</button><div class="collapsible-body" id="recentActivityBody"><div class="timeline">'+tl+'</div></div></div>';appEl.innerHTML=html;}catch(e){appEl.innerHTML='<h1>Analytics</h1><div class="card empty" role="alert">'+esc(e.message)+'</div>';}};
route();
})();

</script>
</body>
</html>`;
}
