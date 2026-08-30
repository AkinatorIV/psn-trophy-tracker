const state = {
  status: null,
  index: null,
  activity: null,
  filter: "all",
  query: "",
  sort: "recent",
  drawerFilter: "missing",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function formatNumber(value) {
  return new Intl.NumberFormat("fr-FR").format(value ?? 0);
}

function trophyTotal(bag = {}) {
  return Object.values(bag).reduce((sum, value) => sum + Number(value || 0), 0);
}

function trophyEmoji(type) {
  return {
    platinum: "💎",
    gold: "🥇",
    silver: "🥈",
    bronze: "🥉",
  }[type] ?? "🏆";
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function relativeTime(value) {
  if (!value) return "date inconnue";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date inconnue";

  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

  if (abs < 60_000) return rtf.format(Math.round(diff / 1_000), "second");
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

async function fetchJson(path) {
  const response = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

function renderHealth() {
  const status = state.status;
  const pill = $("#healthPill");
  const text = $("#healthText");
  const lastSync = $("#lastSync");
  const freshness = $("#syncFreshness");

  pill.classList.remove("is-good", "is-bad");

  if (!status) {
    text.textContent = "Indisponible";
    lastSync.textContent = "—";
    freshness.textContent = "Impossible de lire l’état du tracker";
    return;
  }

  if (status.healthy) {
    pill.classList.add("is-good");
    text.textContent = "Tracker OK";
  } else {
    pill.classList.add("is-bad");
    text.textContent = "Tracker en erreur";
  }

  lastSync.textContent = formatDateTime(status.lastSuccessfulSync);
  freshness.textContent = status.lastSuccessfulSync
    ? `Synchronisé ${relativeTime(status.lastSuccessfulSync)}`
    : "Aucune synchronisation réussie connue";
}

function renderStats() {
  const games = state.index?.games ?? [];
  const totalEarned = games.reduce((sum, game) => sum + trophyTotal(game.earnedTrophies), 0);
  const platinums = games.reduce((sum, game) => sum + Number(game.earnedTrophies?.platinum || 0), 0);

  $("#brandPsnId").textContent = state.index?.psnId ?? state.status?.psnId ?? "AkinatorII";
  $("#statGames").textContent = formatNumber(state.index?.totalGames ?? games.length);
  $("#statPlatinums").textContent = formatNumber(platinums);
  $("#statEarned").textContent = formatNumber(totalEarned);
  $("#statDetailed").textContent = `${state.index?.detailedGames ?? 0}/${state.index?.totalGames ?? games.length}`;
}

function earnedSummary(game) {
  const earned = game.earnedTrophies ?? {};
  return [
    `🥉 ${earned.bronze ?? 0}`,
    `🥈 ${earned.silver ?? 0}`,
    `🥇 ${earned.gold ?? 0}`,
    `💎 ${earned.platinum ?? 0}`,
  ].join("  ");
}

function gameCardHtml(game, compact = false) {
  const earned = trophyTotal(game.earnedTrophies);
  const total = trophyTotal(game.definedTrophies);
  const detailText = game.detailsPath ? "Détail prêt" : "Backfill en cours";

  return `
    <article class="${compact ? "active-card" : "game-card"} panel" data-game-id="${escapeHtml(game.npCommunicationId)}" tabindex="0" role="button" aria-label="Ouvrir ${escapeHtml(game.name)}">
      <div class="card-title-row">
        <div>
          <h3 class="game-title">${escapeHtml(game.name)}</h3>
          <div class="trophy-mini">${escapeHtml(earnedSummary(game))}</div>
        </div>
        <span class="platform-badge">${escapeHtml(game.platform || "PS")}</span>
      </div>
      <div class="progress-line">
        <div class="progress-meta"><span>${earned}/${total || "?"} trophées</span><strong>${game.progress ?? 0} %</strong></div>
        <div class="progress-track"><div class="progress-fill" style="width:${Math.max(0, Math.min(100, game.progress ?? 0))}%"></div></div>
      </div>
      ${compact ? "" : `<div class="game-card-footer"><span>${detailText}</span><span>${game.lastUpdatedDateTime ? relativeTime(game.lastUpdatedDateTime) : "—"}</span></div>`}
    </article>`;
}

function renderActiveGames() {
  const games = (state.index?.games ?? [])
    .filter((game) => game.progress > 0 && game.progress < 100)
    .sort((a, b) => new Date(b.lastUpdatedDateTime || 0) - new Date(a.lastUpdatedDateTime || 0));

  const featured = games.slice(0, 6);
  $("#activeCount").textContent = `${games.length} jeu${games.length > 1 ? "x" : ""} en cours`;
  $("#activeGames").classList.remove("skeleton-grid");
  $("#activeGames").innerHTML = featured.length
    ? featured.map((game) => gameCardHtml(game, true)).join("")
    : `<div class="panel empty-state"><span>✨</span><strong>Aucun jeu en cours</strong><p>Tout est à 0 % ou à 100 %.</p></div>`;
}

function renderActivity() {
  const items = state.activity?.recent?.slice(0, 8) ?? [];
  $("#activityList").innerHTML = items.length
    ? items.map((item) => `
        <div class="activity-item">
          <span class="trophy-type">${trophyEmoji(item.trophy?.type)}</span>
          <div class="activity-copy">
            <strong>${escapeHtml(item.trophy?.name || "Trophée")}</strong>
            <small>${escapeHtml(item.game?.name || "Jeu inconnu")}</small>
          </div>
          <span class="activity-time" title="${escapeHtml(formatDateTime(item.earnedDateTime))}">${escapeHtml(relativeTime(item.earnedDateTime))}</span>
        </div>`).join("")
    : `<div class="loading-block">Aucune activité récente disponible.</div>`;
}

function renderClosestGame() {
  const candidates = (state.index?.games ?? [])
    .filter((game) => game.progress > 0 && game.progress < 100)
    .sort((a, b) => b.progress - a.progress);

  const game = candidates[0];
  const container = $("#closestGame");

  if (!game) {
    container.innerHTML = `<p>Aucun jeu actuellement entre 1 et 99 %.</p>`;
    return;
  }

  const earned = trophyTotal(game.earnedTrophies);
  const total = trophyTotal(game.definedTrophies);
  container.innerHTML = `
    <span class="platform-badge">${escapeHtml(game.platform || "PS")}</span>
    <strong class="closest-score">${game.progress}%</strong>
    <h3 class="game-title">${escapeHtml(game.name)}</h3>
    <p>${earned}/${total} trophées · ${game.earnedTrophies?.platinum ? "Platine obtenu" : "Platine à aller chercher"}</p>
    <button class="filter-chip is-active" type="button" data-open-game="${escapeHtml(game.npCommunicationId)}">Voir les trophées</button>`;
}

function matchesFilter(game) {
  const filter = state.filter;
  if (filter === "progress") return game.progress > 0 && game.progress < 100;
  if (filter === "platinum") return Number(game.earnedTrophies?.platinum || 0) > 0;
  if (filter === "complete") return game.progress === 100;
  if (filter === "ps5") return String(game.platform || "").includes("PS5");
  if (filter === "ps4") return String(game.platform || "").includes("PS4");
  return true;
}

function filteredGames() {
  const query = state.query.trim().toLocaleLowerCase("fr");
  const games = (state.index?.games ?? []).filter((game) => {
    const matchQuery = !query || String(game.name || "").toLocaleLowerCase("fr").includes(query);
    return matchQuery && matchesFilter(game);
  });

  return games.sort((a, b) => {
    if (state.sort === "progress-desc") return (b.progress ?? 0) - (a.progress ?? 0);
    if (state.sort === "progress-asc") return (a.progress ?? 0) - (b.progress ?? 0);
    if (state.sort === "name") return String(a.name).localeCompare(String(b.name), "fr");
    return new Date(b.lastUpdatedDateTime || 0) - new Date(a.lastUpdatedDateTime || 0);
  });
}

function renderLibrary() {
  const games = filteredGames();
  $("#libraryCount").textContent = `${games.length}/${state.index?.games?.length ?? 0}`;
  $("#gamesGrid").innerHTML = games.map((game) => gameCardHtml(game)).join("");
  $("#emptyState").hidden = games.length > 0;
}

function renderAll() {
  renderHealth();
  renderStats();
  renderActiveGames();
  renderActivity();
  renderClosestGame();
  renderLibrary();
}

function bindGameOpeners() {
  document.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-game-id], [data-open-game]");
    if (!opener) return;
    openGame(opener.dataset.gameId || opener.dataset.openGame);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const opener = event.target.closest("[data-game-id]");
    if (!opener) return;
    event.preventDefault();
    openGame(opener.dataset.gameId);
  });
}

async function openGame(id) {
  const game = state.index?.games?.find((item) => item.npCommunicationId === id);
  if (!game) return;

  const drawer = $("#gameDrawer");
  const backdrop = $("#drawerBackdrop");
  const content = $("#drawerContent");

  backdrop.hidden = false;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  const earned = trophyTotal(game.earnedTrophies);
  const total = trophyTotal(game.definedTrophies);

  content.innerHTML = `
    <span class="eyebrow">${escapeHtml(game.platform || "PlayStation")}</span>
    <h2 class="drawer-title" id="drawerTitle">${escapeHtml(game.name)}</h2>
    <div class="drawer-sub">${game.detailsPath ? "Chargement de la liste détaillée…" : "Le détail complet de ce jeu n’a pas encore été backfillé."}</div>
    <div class="drawer-stats">
      <div class="drawer-stat"><small>Progression</small><strong>${game.progress ?? 0} %</strong></div>
      <div class="drawer-stat"><small>Trophées</small><strong>${earned}/${total}</strong></div>
      <div class="drawer-stat"><small>Platine</small><strong>${game.earnedTrophies?.platinum ? "Obtenu" : "Non"}</strong></div>
    </div>
    <div id="drawerTrophies" class="loading-block">${game.detailsPath ? "Lecture des trophées…" : "Le tracker générera automatiquement le détail lors du backfill."}</div>`;

  if (!game.detailsPath) return;

  try {
    const data = await fetchJson(`./${game.detailsPath}`);
    renderDrawerTrophies(data.game);
  } catch (error) {
    console.error(error);
    $("#drawerTrophies").innerHTML = "Impossible de charger le détail de ce jeu.";
  }
}

function renderDrawerTrophies(game) {
  const target = $("#drawerTrophies");
  if (!target || !game?.trophies) return;

  target.className = "";
  target.innerHTML = `
    <div class="trophy-toolbar" role="group" aria-label="Filtrer les trophées">
      <button class="filter-chip ${state.drawerFilter === "missing" ? "is-active" : ""}" data-trophy-filter="missing" type="button">À faire</button>
      <button class="filter-chip ${state.drawerFilter === "earned" ? "is-active" : ""}" data-trophy-filter="earned" type="button">Obtenus</button>
      <button class="filter-chip ${state.drawerFilter === "all" ? "is-active" : ""}" data-trophy-filter="all" type="button">Tous</button>
    </div>
    <div class="trophy-list" id="trophyList"></div>`;

  target.dataset.gameJson = JSON.stringify(game);
  renderTrophyRows(game);
}

function renderTrophyRows(game) {
  const list = $("#trophyList");
  if (!list) return;

  let trophies = [...(game.trophies ?? [])];
  if (state.drawerFilter === "missing") trophies = trophies.filter((t) => !t.earned);
  if (state.drawerFilter === "earned") trophies = trophies.filter((t) => t.earned);

  trophies.sort((a, b) => {
    if (a.earned !== b.earned) return Number(a.earned) - Number(b.earned);
    return Number(a.id) - Number(b.id);
  });

  list.innerHTML = trophies.length
    ? trophies.map((trophy) => `
      <div class="trophy-row ${trophy.earned ? "is-earned" : ""}">
        <span class="trophy-type">${trophyEmoji(trophy.type)}</span>
        <div>
          <strong>${escapeHtml(trophy.name)}</strong>
          <p>${escapeHtml(trophy.description || "")}</p>
        </div>
        <span class="trophy-state">${trophy.earned ? `✓ ${escapeHtml(relativeTime(trophy.earnedDateTime))}` : "À obtenir"}</span>
      </div>`).join("")
    : `<div class="loading-block">Aucun trophée dans ce filtre.</div>`;
}

function closeDrawer() {
  $("#gameDrawer").classList.remove("is-open");
  $("#gameDrawer").setAttribute("aria-hidden", "true");
  $("#drawerBackdrop").hidden = true;
  document.body.style.overflow = "";
}

function bindControls() {
  $("#searchInput").addEventListener("input", (event) => {
    state.query = event.target.value;
    renderLibrary();
  });

  $("#sortSelect").addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderLibrary();
  });

  $$(".filter-chip[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      $$(".filter-chip[data-filter]").forEach((chip) => chip.classList.toggle("is-active", chip === button));
      renderLibrary();
    });
  });

  $("#drawerClose").addEventListener("click", closeDrawer);
  $("#drawerBackdrop").addEventListener("click", closeDrawer);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-trophy-filter]");
    if (!button) return;
    state.drawerFilter = button.dataset.trophyFilter;
    const holder = $("#drawerTrophies");
    if (!holder?.dataset.gameJson) return;
    renderDrawerTrophies(JSON.parse(holder.dataset.gameJson));
  });
}

async function init() {
  try {
    const [status, index, activity] = await Promise.all([
      fetchJson("./data/status.json"),
      fetchJson("./data/index.json"),
      fetchJson("./data/activity.json"),
    ]);

    state.status = status;
    state.index = index;
    state.activity = activity;
    renderAll();
  } catch (error) {
    console.error(error);
    showToast("Impossible de charger les données du tracker");
    $("#healthText").textContent = "Erreur de chargement";
    $("#healthPill").classList.add("is-bad");
    $("#activeGames").innerHTML = `<div class="panel empty-state"><span>⚠️</span><strong>Données indisponibles</strong><p>Recharge la page dans quelques instants.</p></div>`;
  }
}

bindControls();
bindGameOpeners();
init();
