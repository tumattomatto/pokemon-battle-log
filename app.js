import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const PARTY_SIZE = 6;
const TABLE_NAME = "battle_log_data";
const SUPABASE_URL = "https://xzgdrxpnvizplzrumwus.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_85baxPNPFr9Pv_rbmVW2dg_Ekce9cYg";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const state = {
  records: [],
  seasons: [],
  partyPresets: [],
  filters: { season: "all", result: "all", start: "", end: "" },
  user: null
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindElements();
  createPartyInputs();
  bindEvents();
  setDefaultPlayedAt();

  const { data: { session } } = await supabase.auth.getSession();
  await applySession(session);
  supabase.auth.onAuthStateChange((_event, nextSession) => applySession(nextSession));
}

function bindElements() {
  Object.assign(els, {
    appRoot: document.querySelector("#appRoot"),
    authScreen: document.querySelector("#authScreen"),
    authForm: document.querySelector("#authForm"),
    authEmail: document.querySelector("#authEmail"),
    authPassword: document.querySelector("#authPassword"),
    authError: document.querySelector("#authError"),
    logoutButton: document.querySelector("#logoutButton"),
    recordForm: document.querySelector("#recordForm"),
    recordId: document.querySelector("#recordId"),
    resultInput: document.querySelector("#resultInput"),
    playedAtInput: document.querySelector("#playedAtInput"),
    myPartyInputs: document.querySelector("#myPartyInputs"),
    opponentPartyInputs: document.querySelector("#opponentPartyInputs"),
    memoInput: document.querySelector("#memoInput"),
    saveRecordButton: document.querySelector("#saveRecordButton"),
    cancelEditButton: document.querySelector("#cancelEditButton"),
    partyPresetNameInput: document.querySelector("#partyPresetNameInput"),
    savePartyPresetButton: document.querySelector("#savePartyPresetButton"),
    partyPresetList: document.querySelector("#partyPresetList"),
    seasonForm: document.querySelector("#seasonForm"),
    seasonId: document.querySelector("#seasonId"),
    seasonNameInput: document.querySelector("#seasonNameInput"),
    seasonStartInput: document.querySelector("#seasonStartInput"),
    seasonEndInput: document.querySelector("#seasonEndInput"),
    seasonError: document.querySelector("#seasonError"),
    seasonList: document.querySelector("#seasonList"),
    statsGrid: document.querySelector("#statsGrid"),
    filterSeason: document.querySelector("#filterSeason"),
    filterResult: document.querySelector("#filterResult"),
    filterStart: document.querySelector("#filterStart"),
    filterEnd: document.querySelector("#filterEnd"),
    historyList: document.querySelector("#historyList"),
    storageStatus: document.querySelector("#storageStatus")
  });
}

function createPartyInputs() {
  createInputs(els.myPartyInputs, "自分");
  createInputs(els.opponentPartyInputs, "相手");
}

function createInputs(container, label) {
  for (let i = 0; i < PARTY_SIZE; i += 1) {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `${label}${i + 1}`;
    input.dataset.partySlot = String(i);
    container.append(input);
  }
}

function bindEvents() {
  els.authForm.addEventListener("submit", signIn);
  els.logoutButton.addEventListener("click", signOut);
  els.recordForm.addEventListener("submit", saveRecord);
  els.cancelEditButton.addEventListener("click", resetRecordForm);
  els.savePartyPresetButton.addEventListener("click", savePartyPreset);
  els.seasonForm.addEventListener("submit", saveSeason);
  els.filterSeason.addEventListener("change", () => {
    state.filters.season = els.filterSeason.value;
    renderStats();
    renderHistory();
  });
  els.filterResult.addEventListener("change", () => {
    state.filters.result = els.filterResult.value;
    renderHistory();
  });
  els.filterStart.addEventListener("change", () => {
    state.filters.start = els.filterStart.value;
    renderHistory();
  });
  els.filterEnd.addEventListener("change", () => {
    state.filters.end = els.filterEnd.value;
    renderHistory();
  });
}

async function applySession(session) {
  if (!session) {
    state.user = null;
    els.appRoot.classList.add("hidden");
    els.authScreen.classList.remove("hidden");
    els.logoutButton.classList.add("hidden");
    return;
  }

  state.user = session.user;
  els.authScreen.classList.add("hidden");
  els.appRoot.classList.remove("hidden");
  els.logoutButton.classList.remove("hidden");
  await loadState();
  render();
}

async function signIn(event) {
  event.preventDefault();
  els.authError.textContent = "";
  const email = els.authEmail.value.trim();
  const password = els.authPassword.value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) els.authError.textContent = "メールアドレスまたはパスワードを確認してください。";
}

async function signOut() {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) alert("ログアウトに失敗しました。もう一度お試しください。");
}

async function loadState() {
  const { data: row, error } = await supabase
    .from(TABLE_NAME)
    .select("data")
    .eq("user_id", state.user.id)
    .maybeSingle();

  if (error) {
    clearData();
    setStorageStatus("クラウド読込エラー", false);
    alert("クラウドの対戦記録を読み込めませんでした。しばらくしてから再読み込みしてください。");
    return;
  }

  if (row) {
    applyData(row.data);
    setStorageStatus("クラウドに保存中", true);
    return;
  }

  const legacyData = await loadLegacyData();
  applyData(legacyData);
  if (hasData()) {
    if (await persist()) setStorageStatus("ローカル記録を移行済み", true);
  } else {
    setStorageStatus("クラウドに保存中", true);
  }
}

async function loadLegacyData() {
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
  if (!isLocal) return emptyData();
  try {
    const response = await fetch("/api/data", { cache: "no-store" });
    if (!response.ok) throw new Error("legacy data unavailable");
    return await response.json();
  } catch {
    return emptyData();
  }
}

async function persist() {
  if (!state.user) return false;
  const { error } = await supabase.from(TABLE_NAME).upsert({
    user_id: state.user.id,
    data: currentData()
  }, { onConflict: "user_id" });

  if (error) {
    setStorageStatus("クラウド保存エラー", false);
    alert("クラウド保存に失敗しました。通信状態を確認してもう一度お試しください。");
    return false;
  }

  setStorageStatus("クラウドに保存済み", true);
  return true;
}

function emptyData() {
  return { records: [], seasons: [], partyPresets: [] };
}

function currentData() {
  return { records: state.records, seasons: state.seasons, partyPresets: state.partyPresets };
}

function applyData(data) {
  state.records = Array.isArray(data?.records) ? data.records : [];
  state.seasons = Array.isArray(data?.seasons) ? data.seasons : [];
  state.partyPresets = Array.isArray(data?.partyPresets) ? data.partyPresets : [];
}

function clearData() {
  applyData(emptyData());
}

function hasData() {
  return state.records.length > 0 || state.seasons.length > 0 || state.partyPresets.length > 0;
}

function setStorageStatus(text, ok) {
  els.storageStatus.textContent = text;
  els.storageStatus.classList.add("is-danger");
  els.storageStatus.classList.toggle("is-light", ok);
}

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
}

function setDefaultPlayedAt() {
  els.playedAtInput.value = toDatetimeLocalValue(new Date());
}

async function saveRecord(event) {
  event.preventDefault();
  const id = els.recordId.value || newId();
  const now = new Date().toISOString();
  const existing = state.records.find((record) => record.id === id);
  const record = {
    id,
    result: els.resultInput.value,
    playedAt: fromDatetimeLocalValue(els.playedAtInput.value || toDatetimeLocalValue(new Date())),
    myParty: readPartyInputs(els.myPartyInputs),
    opponentParty: readPartyInputs(els.opponentPartyInputs),
    memo: els.memoInput.value.trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  state.records = existing
    ? state.records.map((item) => (item.id === id ? record : item))
    : [record, ...state.records];

  if (await persist()) {
    resetRecordForm();
    render();
  }
}

function readPartyInputs(container) {
  return Array.from(container.querySelectorAll("input")).map((input) => input.value.trim());
}

function fillPartyInputs(container, values) {
  Array.from(container.querySelectorAll("input")).forEach((input, index) => {
    input.value = values?.[index] || "";
  });
}

function resetRecordForm() {
  els.recordId.value = "";
  els.resultInput.value = "win";
  fillPartyInputs(els.myPartyInputs, []);
  fillPartyInputs(els.opponentPartyInputs, []);
  els.memoInput.value = "";
  els.saveRecordButton.textContent = "記録する";
  els.cancelEditButton.classList.add("hidden");
  setDefaultPlayedAt();
}

function editRecord(id) {
  const record = state.records.find((item) => item.id === id);
  if (!record) return;
  els.recordId.value = record.id;
  els.resultInput.value = record.result;
  els.playedAtInput.value = toDatetimeLocalValue(new Date(record.playedAt));
  fillPartyInputs(els.myPartyInputs, record.myParty);
  fillPartyInputs(els.opponentPartyInputs, record.opponentParty);
  els.memoInput.value = record.memo || "";
  els.saveRecordButton.textContent = "更新する";
  els.cancelEditButton.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteRecord(id) {
  if (!confirm("この対戦記録を削除しますか？")) return;
  state.records = state.records.filter((record) => record.id !== id);
  if (await persist()) render();
}

async function savePartyPreset() {
  const party = readPartyInputs(els.myPartyInputs);
  if (!party.some(Boolean)) {
    alert("登録する自分のパーティを入力してください。");
    return;
  }

  const name = els.partyPresetNameInput.value.trim() || `パーティ${state.partyPresets.length + 1}`;
  state.partyPresets.push({ id: newId(), name, party, createdAt: new Date().toISOString() });
  els.partyPresetNameInput.value = "";
  if (await persist()) renderPartyPresets();
}

function applyPartyPreset(id) {
  const preset = state.partyPresets.find((item) => item.id === id);
  if (preset) fillPartyInputs(els.myPartyInputs, preset.party);
}

async function deletePartyPreset(id) {
  if (!confirm("この登録パーティを削除しますか？")) return;
  state.partyPresets = state.partyPresets.filter((item) => item.id !== id);
  if (await persist()) renderPartyPresets();
}

function renderPartyPresets() {
  els.partyPresetList.innerHTML = "";
  if (!state.partyPresets.length) {
    els.partyPresetList.innerHTML = '<div class="empty-inline">登録パーティはまだありません。</div>';
    return;
  }

  state.partyPresets.forEach((preset) => {
    const item = document.createElement("div");
    item.className = "preset-item";
    item.innerHTML = `<button class="ghost-button preset-apply" type="button" data-apply-preset="${preset.id}">${escapeHtml(preset.name)}</button><button class="danger-button preset-delete" type="button" data-delete-preset="${preset.id}">削除</button>`;
    els.partyPresetList.append(item);
  });

  els.partyPresetList.querySelectorAll("[data-apply-preset]").forEach((button) => {
    button.addEventListener("click", () => applyPartyPreset(button.dataset.applyPreset));
  });
  els.partyPresetList.querySelectorAll("[data-delete-preset]").forEach((button) => {
    button.addEventListener("click", () => deletePartyPreset(button.dataset.deletePreset));
  });
}

async function saveSeason(event) {
  event.preventDefault();
  els.seasonError.textContent = "";
  const id = els.seasonId.value || newId();
  const name = els.seasonNameInput.value.trim();
  const start = els.seasonStartInput.value;
  const end = els.seasonEndInput.value;

  if (!name || !start || !end) {
    els.seasonError.textContent = "シーズン名、開始日、終了日を入力してください。";
    return;
  }
  if (start > end) {
    els.seasonError.textContent = "終了日は開始日以降にしてください。";
    return;
  }

  const hasOverlap = state.seasons.some((season) => season.id !== id && start <= season.end && season.start <= end);
  if (hasOverlap) {
    els.seasonError.textContent = "既存シーズンと期間が重なっています。期間を修正してください。";
    return;
  }

  const candidate = { id, name, start, end };
  state.seasons = state.seasons.some((season) => season.id === id)
    ? state.seasons.map((season) => (season.id === id ? candidate : season))
    : [...state.seasons, candidate];
  state.seasons.sort((a, b) => a.start.localeCompare(b.start));

  if (await persist()) {
    resetSeasonForm();
    render();
  }
}

function resetSeasonForm() {
  els.seasonId.value = "";
  els.seasonNameInput.value = "";
  els.seasonStartInput.value = "";
  els.seasonEndInput.value = "";
  els.seasonError.textContent = "";
}

function editSeason(id) {
  const season = state.seasons.find((item) => item.id === id);
  if (!season) return;
  els.seasonId.value = season.id;
  els.seasonNameInput.value = season.name;
  els.seasonStartInput.value = season.start;
  els.seasonEndInput.value = season.end;
}

async function deleteSeason(id) {
  if (!confirm("このシーズンを削除しますか？対戦記録は残ります。")) return;
  state.seasons = state.seasons.filter((season) => season.id !== id);
  if (state.filters.season === id) state.filters.season = "all";
  if (await persist()) render();
}

function render() {
  renderSeasonFilter();
  renderStats();
  renderSeasons();
  renderPartyPresets();
  renderHistory();
}

function renderSeasonFilter() {
  const current = state.filters.season;
  els.filterSeason.innerHTML = "";
  els.filterSeason.append(new Option("すべて", "all"), new Option("未分類", "none"));
  state.seasons.forEach((season) => els.filterSeason.append(new Option(season.name, season.id)));
  els.filterSeason.value = Array.from(els.filterSeason.options).some((option) => option.value === current) ? current : "all";
  state.filters.season = els.filterSeason.value;
}

function renderStats() {
  els.statsGrid.innerHTML = "";
  const selectedSeason = state.seasons.find((season) => season.id === state.filters.season);
  const records = selectedSeason
    ? state.records.filter((record) => getSeasonForRecord(record)?.id === selectedSeason.id)
    : state.filters.season === "none"
      ? state.records.filter((record) => !getSeasonForRecord(record))
      : state.records;
  const wins = records.filter((record) => record.result === "win").length;
  const losses = records.length - wins;
  const rate = records.length ? Math.round((wins / records.length) * 100) : 0;
  const label = selectedSeason ? selectedSeason.name : state.filters.season === "none" ? "未分類" : "すべてのシーズン";
  const card = document.createElement("article");
  card.className = "stat-card season-stat-card";
  card.innerHTML = `
    <span class="season-stat-name">${escapeHtml(label)}</span>
    <strong>${wins}勝 ${losses}敗</strong>
    <span class="season-stat-meta">${records.length ? `勝率 ${rate}% ・ ${records.length}戦` : "対戦記録なし"}</span>
  `;
  els.statsGrid.append(card);
}

function renderSeasons() {
  els.seasonList.innerHTML = "";
  if (!state.seasons.length) {
    els.seasonList.innerHTML = '<div class="empty-state">シーズンを登録すると、対戦記録が自動で分類されます。</div>';
    return;
  }
  state.seasons.forEach((season) => {
    const records = state.records.filter((record) => getSeasonForRecord(record)?.id === season.id);
    const wins = records.filter((record) => record.result === "win").length;
    const rate = records.length ? `${Math.round((wins / records.length) * 100)}%` : "-";
    const item = document.createElement("article");
    item.className = "season-item";
    item.innerHTML = `<div class="season-item-header"><strong>${escapeHtml(season.name)}</strong><span class="badge neutral">${escapeHtml(rate)}</span></div><div class="muted">${formatDate(season.start)} - ${formatDate(season.end)} / ${records.length}試合</div><div class="item-actions"><button class="ghost-button" type="button" data-edit-season="${season.id}">編集</button><button class="danger-button" type="button" data-delete-season="${season.id}">削除</button></div>`;
    els.seasonList.append(item);
  });
  els.seasonList.querySelectorAll("[data-edit-season]").forEach((button) => button.addEventListener("click", () => editSeason(button.dataset.editSeason)));
  els.seasonList.querySelectorAll("[data-delete-season]").forEach((button) => button.addEventListener("click", () => deleteSeason(button.dataset.deleteSeason)));
}

function renderHistory() {
  const records = getFilteredRecords();
  els.historyList.innerHTML = "";
  if (!records.length) {
    els.historyList.innerHTML = '<div class="empty-state">条件に合う対戦記録はありません。</div>';
    return;
  }
  records.forEach((record) => {
    const season = getSeasonForRecord(record);
    const item = document.createElement("article");
    item.className = "history-item";
    item.innerHTML = `<div class="history-header"><div><span class="badge ${record.result}">${record.result === "win" ? "勝ち" : "負け"}</span> <span class="muted">${formatDateTime(record.playedAt)}</span></div><span class="muted">${escapeHtml(season ? season.name : "未分類")}</span></div><div class="party-summary">${renderPartySummary("自分", record.myParty)}${renderPartySummary("相手", record.opponentParty)}</div>${record.memo ? `<p class="memo-preview">${escapeHtml(record.memo)}</p>` : ""}<div class="item-actions"><button class="ghost-button" type="button" data-edit-record="${record.id}">編集</button><button class="danger-button" type="button" data-delete-record="${record.id}">削除</button></div>`;
    els.historyList.append(item);
  });
  els.historyList.querySelectorAll("[data-edit-record]").forEach((button) => button.addEventListener("click", () => editRecord(button.dataset.editRecord)));
  els.historyList.querySelectorAll("[data-delete-record]").forEach((button) => button.addEventListener("click", () => deleteRecord(button.dataset.deleteRecord)));
}

function renderPartySummary(title, party) {
  const names = (party || []).filter(Boolean);
  const chips = names.length ? names.map((name) => `<span class="pokemon-chip">${escapeHtml(name)}</span>`).join("") : '<span class="muted">未入力</span>';
  return `<div><h4>${escapeHtml(title)}</h4><div class="pokemon-list">${chips}</div></div>`;
}

function getFilteredRecords() {
  return state.records.slice().filter((record) => {
    const date = toDateKey(record.playedAt);
    const season = getSeasonForRecord(record);
    if (state.filters.result !== "all" && record.result !== state.filters.result) return false;
    if (state.filters.season === "none" && season) return false;
    if (state.filters.season !== "all" && state.filters.season !== "none" && (!season || season.id !== state.filters.season)) return false;
    if (state.filters.start && date < state.filters.start) return false;
    if (state.filters.end && date > state.filters.end) return false;
    return true;
  }).sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));
}

function getSeasonForRecord(record) {
  const date = toDateKey(record.playedAt);
  return state.seasons.find((season) => season.start <= date && date <= season.end) || null;
}

function toDatetimeLocalValue(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocalValue(value) {
  return new Date(value).toISOString();
}

function toDateKey(value) {
  return toDatetimeLocalValue(new Date(value)).slice(0, 10);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
