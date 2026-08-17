const $ = (s) => document.querySelector(s);
let projects = [];
let current = null;
let authTimer = null;

async function loadProjects() {
  projects = await (await fetch("/api/projects")).json();
  renderDropdown();
  if (!current && projects.length) selectRepo(projects[0].repo_name);
}

function renderDropdown() {
  const dd = $("#dropdown");
  dd.innerHTML = "";
  for (const p of projects) {
    const el = document.createElement("div");
    el.className = "item";
    el.textContent = p.repo_name;
    el.onclick = () => selectRepo(p.repo_name);
    dd.appendChild(el);
  }
}

function selectRepo(name) {
  current = projects.find((p) => p.repo_name === name);
  $("#repo-name").textContent = name;
  $("#dropdown").classList.add("hidden");
  renderMain();
}

async function renderMain() {
  const p = current;
  if (!p) { $("#main").innerHTML = '<div class="welcome"><p>还没有项目。</p><p>点右上「连接 GitHub」，授权后自动同步你的仓库。</p></div>'; return; }
  $("#main").innerHTML = `
    <div class="headline">
      <input id="goal" value="${(p.goal || "").replace(/"/g, "&quot;")}" placeholder="一句话目标" />
      <span class="badge">${p.status || "进行中"}</span>
      <span class="badge mid">优先级 ${p.priority || "中"}</span>
      <span class="badge tags">${p.tags || "无标签"}</span>
    </div>
    <div class="stats">
      <div class="stat"><div class="k">活跃度</div><div class="v">近30天 ${p.commits_30d} commits</div></div>
      <div class="stat"><div class="k">open issues</div><div class="v">${p.open_issues}</div></div>
      <div class="stat"><div class="k">open PR</div><div class="v">${p.open_prs}</div></div>
      <div class="stat"><div class="k">stars</div><div class="v">${p.stars}</div></div>
    </div>
    <div class="tasks">
      <div class="tasks-head"><span>任务</span><span id="task-filter">GitHub + 本地</span></div>
      <div id="task-list"></div>
      <div class="task"><button class="add" onclick="addTodo()">+ 本地 TODO</button></div>
    </div>
    <div class="notes"><textarea id="notes" placeholder="备注 / 反思…">${(p.notes || "").replace(/</g, "&lt;")}</textarea></div>
  `;
  $("#goal").onchange = (e) => saveField({ goal: e.target.value });
  $("#notes").onchange = (e) => saveField({ notes: e.target.value });
  await renderTasks();
}

async function renderTasks() {
  const list = $("#task-list");
  if (!list) return;
  list.innerHTML = "";
  const todos = await (await fetch(`/api/projects/${current.repo_name}/todos`)).json();
  for (const t of todos) {
    const row = document.createElement("div");
    row.className = "task" + (t.done ? " done" : "");
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = !!t.done;
    cb.onchange = async () => {
      await fetch(`/api/todos/${t.id}/done`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: cb.checked }),
      });
      row.classList.toggle("done", cb.checked);
    };
    const title = document.createElement("span");
    title.textContent = "[本地] " + t.title;
    row.append(cb, title);
    list.appendChild(row);
  }
}

async function addTodo() {
  const title = prompt("新 TODO：");
  if (!title) return;
  await fetch(`/api/projects/${current.repo_name}/todos`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, priority: "中" }),
  });
  renderTasks();
}

async function saveField(patch) {
  await fetch(`/api/projects/${current.repo_name}/field`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

async function checkAuth() {
  const s = await (await fetch("/api/auth/status")).json();
  if (!s.connected) {
    $("#connect-btn").classList.remove("hidden");
    $("#statusbar").textContent = "vibepm · 未连接 GitHub";
    if (!projects.length) {
      $("#main").innerHTML = '<div class="welcome"><p>还没有项目。</p><p>点右上「连接 GitHub」，授权后自动同步你的仓库。</p></div>';
    }
  } else {
    $("#connect-btn").classList.add("hidden");
    $("#statusbar").textContent = "vibepm · 已连接 " + (s.owner || "");
  }
}

async function startConnect() {
  const d = await (await fetch("/api/auth/device", { method: "POST" })).json();
  if (d.state !== "pending") { alert(d.message || "连接失败"); return; }
  $("#auth-code").textContent = d.user_code;
  $("#auth-uri").href = d.verification_uri;
  $("#auth-state").textContent = "打开链接输入设备码，等待授权…";
  $("#auth-modal").classList.remove("hidden");
  clearInterval(authTimer);
  authTimer = setInterval(() => pollAuth(), (d.interval || 5) * 1000);
}

async function pollAuth() {
  const r = await (await fetch("/api/auth/device/poll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device_code: window._dc }) })).json();
  if (r.state === "ok") {
    clearInterval(authTimer);
    $("#auth-modal").classList.add("hidden");
    $("#statusbar").textContent = "已连接 GitHub，正在同步…";
    await fetch("/api/sync", { method: "POST" });
    await loadProjects();
    checkAuth();
  } else if (r.state === "error") {
    clearInterval(authTimer);
    $("#auth-state").textContent = r.message;
  } else if (r.state === "none") {
    clearInterval(authTimer);
  }
}

async function startConnectInner() {
  const d = await (await fetch("/api/auth/device", { method: "POST" })).json();
  if (d.state !== "pending") { alert(d.message || "连接失败"); return; }
  window._dc = d.device_code;
  $("#auth-code").textContent = d.user_code;
  $("#auth-uri").href = d.verification_uri;
  $("#auth-state").textContent = "打开链接输入设备码，等待授权…";
  $("#auth-modal").classList.remove("hidden");
  clearInterval(authTimer);
  authTimer = setInterval(() => pollAuth(), (d.interval || 5) * 1000);
}

$("#add-btn").onclick = () => $("#dropdown").classList.toggle("hidden");
$("#connect-btn").onclick = startConnectInner;
$("#auth-cancel").onclick = () => {
  clearInterval(authTimer);
  $("#auth-modal").classList.add("hidden");
};
$("#sync-btn").onclick = async () => {
  $("#statusbar").textContent = "同步中…";
  const r = await (await fetch("/api/sync", { method: "POST" })).json();
  if (r.ok) {
    $("#statusbar").textContent = "同步完成";
    await loadProjects();
  } else {
    $("#statusbar").textContent = r.reason === "not_connected" ? "未连接 GitHub" : "同步失败";
    if (r.reason === "not_connected") checkAuth();
  }
};

async function boot() {
  await loadProjects();
  await checkAuth();
}
boot();