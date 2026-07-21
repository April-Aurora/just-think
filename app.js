const STORAGE_KEYS = {
  ideas: "suibianxiangxiang.ideas.v1",
  results: "suibianxiangxiang.results.v1",
  layout: "suibianxiangxiang.layout.v4"
};

const seedIdeas = [
  { id: crypto.randomUUID(), text: "测试想法 01：做一档让观众决定下一秒剧情的短视频。", category: "待整理", createdAt: Date.now() - 1000 * 60 * 12 },
  { id: crypto.randomUUID(), text: "测试想法 02：把城市里没被注意的声音做成可收集的情绪地图。", category: "待整理", createdAt: Date.now() - 1000 * 60 * 8 },
  { id: crypto.randomUUID(), text: "测试想法 03：做一个让陌生人交换‘今天没说出口的话’的夜间电台。", category: "待整理", createdAt: Date.now() - 1000 * 60 * 3 }
];

let ideas = load(STORAGE_KEYS.ideas, seedIdeas);
let results = load(STORAGE_KEYS.results, []);
let cardLayout = load(STORAGE_KEYS.layout, {});
let selected = new Set();
let currentMode = "structure";
let currentResult = null;
let aiConfigured = false;
let accessRequired = false;
let toastTimer;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEYS.ideas, JSON.stringify(ideas));
  localStorage.setItem(STORAGE_KEYS.results, JSON.stringify(results));
  localStorage.setItem(STORAGE_KEYS.layout, JSON.stringify(cardLayout));
  updateMeta();
}

function escapeHTML(value = "") {
  const node = document.createElement("div");
  node.textContent = value;
  return node.innerHTML;
}

function timeLabel(timestamp) {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(timestamp);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function showAccessGate(dailyLimit = 20) {
  accessRequired = true;
  const gate = $("#accessGate");
  gate.hidden = false;
  gate.classList.remove("is-granted", "is-checking");
  $("#accessDailyLimit").textContent = dailyLimit;
  document.body.classList.remove("access-pending");
  document.body.classList.add("access-locked");
  $(".app-shell").inert = true;
  requestAnimationFrame(() => $("#accessCode").focus());
}

function hideAccessGate(animate = false) {
  const gate = $("#accessGate");
  const finish = () => {
    gate.hidden = true;
    gate.classList.remove("is-granted", "is-checking");
    document.body.classList.remove("access-pending", "access-locked");
    $(".app-shell").inert = false;
  };
  if (!animate) return finish();
  gate.classList.add("is-granted");
  setTimeout(finish, 320);
}

async function checkAccessStatus() {
  try {
    const response = await fetch("/api/access/status", { cache: "no-store" });
    const data = await response.json();
    accessRequired = Boolean(data.required);
    if (!accessRequired || data.authorized) hideAccessGate(false);
    else showAccessGate(data.dailyLimit);
  } catch {
    showAccessGate();
    $("#accessError").textContent = "服务暂时无法连接";
  }
}

async function submitAccessCode(event) {
  event.preventDefault();
  const gate = $("#accessGate");
  const button = $("#accessSubmit");
  const error = $("#accessError");
  button.disabled = true;
  gate.classList.add("is-checking");
  error.textContent = "";
  try {
    const response = await fetch("/api/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: $("#accessCode").value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "无法验证访问码");
    $("#accessCode").value = "";
    hideAccessGate(true);
  } catch (requestError) {
    gate.classList.remove("is-checking");
    error.textContent = requestError.message;
    $("#accessCode").select();
  } finally {
    button.disabled = false;
  }
}

function updateMeta() {
  $("#ideaCount").textContent = String(ideas.length).padStart(2, "0");
  $("#resultCount").textContent = String(results.length).padStart(2, "0");
  const bytes = new Blob([JSON.stringify({ ideas, results })]).size;
  $("#storageLabel").textContent = `${(bytes / 1024).toFixed(1)} KB`;
  $("#storageMeter").style.width = `${Math.min(100, Math.max(4, bytes / 512))}%`;
}

function renderIdeas() {
  const query = $("#searchInput").value.trim().toLowerCase();
  const filter = $("#filterSelect").value;
  const visible = ideas.filter(item => (filter === "全部" || item.category === filter) && item.text.toLowerCase().includes(query));
  const ideaGrid = $("#ideaGrid");
  ideaGrid.classList.toggle("many", visible.length >= 6);
  ideaGrid.dataset.count = visible.length;
  ideaGrid.innerHTML = visible.map((item, index) => `
    <article class="idea-card ${selected.has(item.id) ? "selected" : ""}" data-id="${item.id}">
      <div class="card-top">
        <span class="card-id">ID-${String(ideas.indexOf(item) + 1).padStart(3, "0")}</span>
        <input class="card-check" type="checkbox" aria-label="选择想法：${escapeHTML(item.text)}" ${selected.has(item.id) ? "checked" : ""}>
      </div>
      <h3>${escapeHTML(item.text)}</h3>
      <div class="card-footer"><span>${escapeHTML(item.category)} · ${timeLabel(item.createdAt)}</span><button class="card-delete" type="button">删除</button></div>
    </article>`).join("");
  $("#ideaGrid").hidden = visible.length === 0;
  $("#emptyIdeas").hidden = visible.length !== 0;

  $$(".idea-card").forEach(card => {
    const id = card.dataset.id;
    $(".card-check", card).addEventListener("change", event => toggleSelection(id, event.target.checked));
    card.addEventListener("click", event => {
      if (card.dataset.dragged === "true") {
        card.dataset.dragged = "false";
        return;
      }
      if (event.target.closest("button") || event.target.matches("input")) return;
      toggleSelection(id, !selected.has(id));
    });
    $(".card-delete", card).addEventListener("click", () => deleteIdea(id));
    enableCardDrag(card, id);
  });
  updateSelectionBar();
  updateMeta();
}

function enableCardDrag(card, id) {
  const grid = $("#ideaGrid");
  const saved = cardLayout[id];
  if (saved && grid.clientWidth > 0) {
    const maxLeft = Math.max(0, grid.clientWidth - card.offsetWidth);
    const maxTop = Math.max(0, grid.clientHeight - card.offsetHeight);
    const savedLeft = saved.x * maxLeft;
    const savedTop = saved.y * maxTop;
    card.style.left = `${Math.round(savedLeft)}px`;
    card.style.top = `${Math.round(savedTop)}px`;
    card.style.right = "auto";
  }

  let pointerId = null;
  let startPointerX = 0;
  let startPointerY = 0;
  let startLeft = 0;
  let startTop = 0;
  let lastValidLeft = 0;
  let lastValidTop = 0;

  card.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.target.closest("button, input, select, textarea")) return;
    pointerId = event.pointerId;
    startPointerX = event.clientX;
    startPointerY = event.clientY;
    startLeft = card.offsetLeft;
    startTop = card.offsetTop;
    lastValidLeft = startLeft;
    lastValidTop = startTop;
    card.style.left = `${startLeft}px`;
    card.style.top = `${startTop}px`;
    card.style.right = "auto";
    card.classList.add("dragging");
    card.setPointerCapture(pointerId);
    event.preventDefault();
  });

  card.addEventListener("pointermove", event => {
    if (event.pointerId !== pointerId) return;
    const deltaX = event.clientX - startPointerX;
    const deltaY = event.clientY - startPointerY;
    const maxLeft = Math.max(0, grid.clientWidth - card.offsetWidth);
    const maxTop = Math.max(0, grid.clientHeight - card.offsetHeight);
    const nextLeft = Math.min(maxLeft, Math.max(0, startLeft + deltaX));
    const nextTop = Math.min(maxTop, Math.max(0, startTop + deltaY));
    lastValidLeft = nextLeft;
    lastValidTop = nextTop;
    card.style.left = `${Math.round(lastValidLeft)}px`;
    card.style.top = `${Math.round(lastValidTop)}px`;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 5) card.dataset.dragged = "true";
  });

  const finishDrag = event => {
    if (event.pointerId !== pointerId) return;
    card.classList.remove("dragging");
    if (card.hasPointerCapture(pointerId)) card.releasePointerCapture(pointerId);
    pointerId = null;
    const maxLeft = Math.max(1, grid.clientWidth - card.offsetWidth);
    const maxTop = Math.max(1, grid.clientHeight - card.offsetHeight);
    cardLayout[id] = {
      x: Math.min(1, Math.max(0, card.offsetLeft / maxLeft)),
      y: Math.min(1, Math.max(0, card.offsetTop / maxTop))
    };
    localStorage.setItem(STORAGE_KEYS.layout, JSON.stringify(cardLayout));
  };

  card.addEventListener("pointerup", finishDrag);
  card.addEventListener("pointercancel", finishDrag);
}

function repairAutoArrangement(grid) {
  const cards = $$(".idea-card", grid).filter(card => getComputedStyle(card).display !== "none");
  if (!cards.length) return;

  const ideasView = $("#ideasView");
  ideasView.style.removeProperty("min-height");
  const compact = innerWidth <= 680;
  const margin = compact ? 2 : 18;
  const maxCardWidth = Math.max(...cards.map(card => card.offsetWidth));
  const maxCardHeight = Math.max(...cards.map(card => card.offsetHeight));
  const toolbar = $(".library-toolbar");
  const capture = $(".capture-panel");
  const selectionBar = $("#selectionBar");
  const gridRect = grid.getBoundingClientRect();
  const edgeGap = compact ? 12 : 18;
  const startTop = Math.max(margin, toolbar.getBoundingClientRect().bottom - gridRect.top + edgeGap);
  let obstacleTop = capture.getBoundingClientRect().top - gridRect.top - edgeGap;
  if (selectionBar.classList.contains("visible")) {
    obstacleTop = Math.min(obstacleTop, selectionBar.getBoundingClientRect().top - gridRect.top - edgeGap);
  }
  const availableWidth = Math.max(maxCardWidth, grid.clientWidth - margin * 2);
  const availableHeight = Math.max(maxCardHeight, obstacleTop - startTop);
  const minColumnStep = maxCardWidth * .52;
  const minRowStep = maxCardHeight * .52;
  const maxColumns = Math.max(1, Math.floor((availableWidth - maxCardWidth) / minColumnStep) + 1);
  const maxRows = Math.max(1, Math.floor((availableHeight - maxCardHeight) / minRowStep) + 1);
  const naturalColumns = Math.max(1, Math.floor((availableWidth + 28) / (maxCardWidth + 28)));
  let columns = Math.min(cards.length, compact ? Math.min(2, maxColumns) : Math.min(4, maxColumns), naturalColumns);
  let rows = Math.ceil(cards.length / columns);

  if (rows > maxRows) {
    columns = Math.min(maxColumns, Math.max(columns, Math.ceil(cards.length / maxRows)));
    rows = Math.ceil(cards.length / columns);
  }

  const columnStep = columns > 1 ? (availableWidth - maxCardWidth) / (columns - 1) : 0;
  const rowStep = rows > 1 ? (availableHeight - maxCardHeight) / (rows - 1) : 0;

  cards.forEach((card, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const itemsInRow = Math.min(columns, cards.length - row * columns);
    const rowWidth = maxCardWidth + Math.max(0, itemsInRow - 1) * columnStep;
    const rowStart = Math.max(margin, margin + (availableWidth - rowWidth) / 2);
    const left = rowStart + column * columnStep;
    const top = startTop + row * rowStep;
    const maxLeft = Math.max(0, grid.clientWidth - card.offsetWidth);
    const maxTop = Math.max(0, grid.clientHeight - card.offsetHeight);
    card.style.left = `${Math.round(Math.min(maxLeft, Math.max(0, left)))}px`;
    card.style.top = `${Math.round(Math.min(maxTop, Math.max(0, top)))}px`;
    card.style.right = "auto";
  });
}

function saveAutoArrangement(grid) {
  cardLayout = {};
  $$(".idea-card", grid).forEach(card => {
    if (getComputedStyle(card).display === "none") return;
    const maxLeft = Math.max(1, grid.clientWidth - card.offsetWidth);
    const maxTop = Math.max(1, grid.clientHeight - card.offsetHeight);
    cardLayout[card.dataset.id] = {
      x: Math.min(1, Math.max(0, card.offsetLeft / maxLeft)),
      y: Math.min(1, Math.max(0, card.offsetTop / maxTop))
    };
  });
  localStorage.setItem(STORAGE_KEYS.layout, JSON.stringify(cardLayout));
}

function autoArrangeIdeas() {
  cardLayout = {};
  localStorage.removeItem(STORAGE_KEYS.layout);
  const grid = $("#ideaGrid");
  $("#ideasView").style.removeProperty("min-height");
  grid.classList.add("arranging");
  $$(".idea-card", grid).forEach(card => {
    card.style.removeProperty("left");
    card.style.removeProperty("top");
    card.style.removeProperty("right");
    card.dataset.dragged = "false";
  });
  requestAnimationFrame(() => {
    repairAutoArrangement(grid);
    saveAutoArrangement(grid);
  });
  setTimeout(() => grid.classList.remove("arranging"), 650);
  showToast("想法卡已自动排列");
}

function toggleSelection(id, value) {
  if (value) selected.add(id); else selected.delete(id);
  const card = $(`.idea-card[data-id="${id}"]`);
  if (card) {
    card.classList.toggle("selected", value);
    const checkbox = $(".card-check", card);
    if (checkbox) checkbox.checked = value;
  }
  updateSelectionBar();
}

function enhanceSelect(select) {
  const control = document.createElement("div");
  control.className = "custom-select";
  control.classList.add(`custom-select-${select.id}`);
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "custom-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", select.getAttribute("aria-label") || "选择选项");
  const value = document.createElement("span");
  const chevron = document.createElement("i");
  chevron.className = "custom-select-chevron";
  trigger.append(value, chevron);
  const menu = document.createElement("div");
  menu.className = "custom-select-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;

  [...select.options].forEach(option => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "custom-select-option";
    item.dataset.value = option.value;
    item.textContent = option.textContent;
    item.setAttribute("role", "option");
    item.addEventListener("click", () => {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      sync();
      close();
      trigger.focus();
    });
    menu.append(item);
  });

  const sync = () => {
    value.textContent = select.options[select.selectedIndex]?.textContent || "";
    $$(".custom-select-option", menu).forEach(item => {
      const active = item.dataset.value === select.value;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
  };
  const close = () => {
    menu.hidden = true;
    control.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
  };
  const open = () => {
    $$(".custom-select.open").forEach(other => {
      if (other !== control) other.querySelector(".custom-select-trigger")?.click();
    });
    menu.hidden = false;
    control.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
  };
  trigger.addEventListener("click", () => control.classList.contains("open") ? close() : open());
  trigger.addEventListener("keydown", event => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      open();
      $(".custom-select-option", menu)?.focus();
    }
    if (event.key === "Escape") close();
  });
  menu.addEventListener("keydown", event => {
    if (event.key === "Escape") { close(); trigger.focus(); }
  });
  document.addEventListener("pointerdown", event => { if (!control.contains(event.target)) close(); });
  select.addEventListener("change", sync);
  select.hidden = true;
  select.parentNode.insertBefore(control, select);
  control.append(trigger, menu, select);
  sync();
}

function enhanceSelects() {
  enhanceSelect($("#categoryInput"));
  enhanceSelect($("#filterSelect"));
}

function updateSelectionBar() {
  const count = selected.size;
  $("#selectedCount").textContent = count;
  $("#selectionBar").classList.toggle("visible", count > 0);
}

function deleteIdea(id) {
  ideas = ideas.filter(item => item.id !== id);
  selected.delete(id);
  delete cardLayout[id];
  persist();
  renderIdeas();
  showToast("想法已删除");
}

function addIdea() {
  const input = $("#ideaInput");
  const text = input.value.trim();
  if (!text) {
    input.focus();
    showToast("先写下一条想法");
    return;
  }
  const idea = { id: crypto.randomUUID(), text, category: $("#categoryInput").value, createdAt: Date.now() };
  ideas.unshift(idea);
  input.value = "";
  $("#charCount").textContent = "0 / 280";
  persist();
  renderIdeas();
  showToast("已保存到想法库");
}

const viewCopy = {
  ideas: ["THOUGHT SPACE / NOW", "让想法在这里漂浮"],
  studio: ["IMAGINATION FIELD / AI", "把一个念头，想得更远"],
  archive: ["MEMORY / SPARKS", "回看曾经长出的灵感分支"]
};

function switchView(name) {
  $$(".view").forEach(panel => panel.classList.toggle("active", panel.dataset.viewPanel === name));
  $$(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === name));
  $("#viewEyebrow").textContent = viewCopy[name][0];
  $("#viewTitle").textContent = viewCopy[name][1];
  if (name === "ideas") renderIdeas();
  if (name === "studio") renderSources();
  if (name === "archive") renderArchive();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderSources() {
  $("#studioSelectedCount").textContent = `${selected.size} 条已选择，可在这里调整`;
  const gauge = $("#studioSelectedGauge");
  if (gauge) gauge.textContent = `${String(selected.size).padStart(2, "0")} / ${String(ideas.length).padStart(2, "0")}`;
  $("#sourceList").innerHTML = ideas.length ? ideas.map((item, index) => `
    <div class="source-item ${selected.has(item.id) ? "selected" : ""}" data-id="${item.id}">
      <div class="source-item-top">
        <span>IDEA ${String(index + 1).padStart(2, "0")}</span>
        <input class="source-check" type="checkbox" aria-label="在灵感实验室选择想法：${escapeHTML(item.text)}" ${selected.has(item.id) ? "checked" : ""}>
      </div>
      <p>${escapeHTML(item.text)}</p>
    </div>`).join("")
    : `<p class="source-empty">还没有想法，请先记录一条内容。</p>`;

  $$(".source-item").forEach(item => {
    const id = item.dataset.id;
    $(".source-check", item).addEventListener("change", event => {
      if (event.target.checked) selected.add(id); else selected.delete(id);
      renderSources();
      renderIdeas();
    });
    item.addEventListener("click", event => {
      if (event.target.matches("input")) return;
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      renderSources();
      renderIdeas();
    });
  });
  updateStudioCore();
}

function updateStudioCore() {
  const modeLabels = { structure: "灵感漫游", connect: "意外碰撞", next: "平行想象" };
  const modeLabel = $("#coreModeLabel");
  const selectionLabel = $("#coreSelectionLabel");
  if (modeLabel) modeLabel.textContent = modeLabels[currentMode];
  if (selectionLabel) selectionLabel.textContent = selected.size ? `${selected.size} 条想法正在一起探索` : "先带上一条想法";
}

function renderResult(result) {
  $("#resultContent").innerHTML = `
    <div class="result-block"><h3><b>ORIGIN</b>${escapeHTML(result.title)}</h3><p>${escapeHTML(result.summary)}</p></div>
    ${result.sections.map(section => `<div class="result-block"><h3><b>BRANCH</b>${escapeHTML(section[0])}</h3><ul>${section[1].map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul></div>`).join("")}
    ${result.instruction ? `<div class="result-block"><h3><b>TUNE</b>你的探索偏好</h3><p>${escapeHTML(result.instruction)}</p></div>` : ""}`;
  $("#resultTime").textContent = "刚刚生成";
  $("#resultPanel").hidden = false;
}

async function startGeneration() {
  const sourceIdeas = ideas.filter(item => selected.has(item.id));
  if (!sourceIdeas.length) {
    showToast("请先选择至少一条想法");
    switchView("ideas");
    return;
  }
  if (!aiConfigured) {
    await checkAIStatus();
    if (!aiConfigured) {
      showToast("请先在 .env 中配置 AI 模型服务");
      return;
    }
  }
  const button = $("#generateButton");
  const panel = $("#processingPanel");
  const steps = $$("li", $("#processSteps"));
  button.disabled = true;
  currentResult = null;
  $(".studio-layout")?.classList.add("is-processing");
  panel.hidden = false;
  $("#resultPanel").hidden = true;
  steps.forEach(step => step.classList.remove("done"));
  let progress = 8;
  const updateProgress = value => {
    progress = value;
    $("#progressNumber").textContent = `${String(progress).padStart(2, "0")}%`;
    $("#progressBar").style.width = `${progress}%`;
    steps.forEach((step, index) => step.classList.toggle("done", progress >= (index + 1) * 23));
  };
  updateProgress(progress);
  const progressTimer = setInterval(() => updateProgress(Math.min(88, progress + Math.floor(Math.random() * 7) + 3)), 420);

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: currentMode,
        ideas: sourceIdeas.map(({ text, category }) => ({ text, category })),
        instruction: $("#instructionInput").value.trim()
      })
    });
    const data = await response.json();
    if (response.status === 401 && accessRequired) showAccessGate();
    if (!response.ok) throw new Error(data.error || "AI 分析失败");
    clearInterval(progressTimer);
    updateProgress(100);
    currentResult = data.result;
    renderResult(currentResult);
    showToast("灵感探索完成，可以继续补充或保存");
  } catch (error) {
    clearInterval(progressTimer);
    showToast(error.message || "AI 分析失败，请稍后重试");
  } finally {
    panel.hidden = true;
    button.disabled = false;
    $(".studio-layout")?.classList.remove("is-processing");
  }
}

async function checkAIStatus() {
  const state = $(".engine-state");
  const label = $("#engineStateLabel");
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const data = await response.json();
    aiConfigured = Boolean(response.ok && data.configured);
    state.classList.toggle("offline", !aiConfigured);
    state.classList.toggle("ready", aiConfigured);
    label.textContent = aiConfigured ? "真实 AI 已连接" : "等待配置 API Key";
  } catch {
    aiConfigured = false;
    state.classList.add("offline");
    state.classList.remove("ready");
    label.textContent = "后端服务未连接";
  }
}

function resultToText(result) {
  return [result.title, result.summary, ...result.sections.flatMap(section => [section[0], ...section[1]])].join("\n");
}

function saveCurrentResult() {
  if (!currentResult) return;
  results.unshift({
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...currentResult,
    note: $("#resultNote").value.trim(),
    sourceIds: [...selected]
  });
  persist();
  showToast("已保存到灵感档案");
  switchView("archive");
}

function renderArchive() {
  $("#archiveList").innerHTML = results.map(item => `
    <article class="archive-item" data-id="${item.id}">
      <div><time>${new Intl.DateTimeFormat("zh-CN", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" }).format(item.createdAt)}</time><br><small>${escapeHTML(item.modeName)}</small></div>
      <div><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.summary)}</p></div>
      <button type="button">删除</button>
    </article>`).join("");
  $$(".archive-item button").forEach(button => button.addEventListener("click", () => {
    const id = button.closest(".archive-item").dataset.id;
    results = results.filter(item => item.id !== id);
    persist(); renderArchive(); showToast("档案已删除");
  }));
}

function bindEvents() {
  $("#accessForm").addEventListener("submit", submitAccessCode);
  $$(".nav-item").forEach(button => button.addEventListener("click", () => switchView(button.dataset.view)));
  $$('[data-back-to-ideas]').forEach(button => button.addEventListener("click", () => switchView("ideas")));
  $("#ideaInput").addEventListener("input", event => $("#charCount").textContent = `${event.target.value.length} / 280`);
  $("#ideaInput").addEventListener("keydown", event => { if (event.ctrlKey && event.key === "Enter") addIdea(); });
  $("#saveIdea").addEventListener("click", addIdea);
  $("#searchInput").addEventListener("input", renderIdeas);
  $("#filterSelect").addEventListener("change", renderIdeas);
  $("#autoArrange").addEventListener("click", autoArrangeIdeas);
  $("#clearSelection").addEventListener("click", () => {
    selected.clear();
    $$(".idea-card").forEach(card => {
      card.classList.remove("selected");
      const checkbox = $(".card-check", card);
      if (checkbox) checkbox.checked = false;
    });
    updateSelectionBar();
  });
  $("#sendToAI").addEventListener("click", () => switchView("studio"));
  $$(".mode-option").forEach(button => button.addEventListener("click", () => {
    currentMode = button.dataset.mode;
    $$(".mode-option").forEach(item => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-checked", String(active));
    });
    updateStudioCore();
  }));
  $("#generateButton").addEventListener("click", startGeneration);
  $("#retryButton").addEventListener("click", startGeneration);
  $("#copyButton").addEventListener("click", async () => {
    if (!currentResult) return;
    try { await navigator.clipboard.writeText(resultToText(currentResult)); showToast("结果已复制"); }
    catch { showToast("浏览器未允许复制，请手动选择文字"); }
  });
  $("#saveResult").addEventListener("click", saveCurrentResult);
  $("#clearArchive").addEventListener("click", () => {
    if (!results.length) return showToast("档案已经是空的");
    if (window.confirm("确定清空所有灵感档案吗？")) { results = []; persist(); renderArchive(); showToast("灵感档案已清空"); }
  });
  $("#themePulse").addEventListener("click", () => document.body.classList.toggle("focus-mode"));
  document.addEventListener("pointermove", event => {
    document.documentElement.style.setProperty("--px", `${(event.clientX / innerWidth - .5) * 2}`);
    document.documentElement.style.setProperty("--py", `${(event.clientY / innerHeight - .5) * 2}`);
  });
}

function startClock() {
  const tick = () => $("#clock").textContent = new Intl.DateTimeFormat("zh-CN", { hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false }).format(new Date());
  tick(); setInterval(tick, 1000);
}

enhanceSelects();
bindEvents();
renderIdeas();
renderArchive();
checkAccessStatus();
checkAIStatus();
startClock();
