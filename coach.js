(() => {
  const coachState = {
    activeGameId: null,
    guides: new Map(),
    games: new Map(),
    pending: false,
  };

  const escapeHtml = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function injectStyles() {
    if (document.querySelector("#coach-styles")) return;

    const style = document.createElement("style");
    style.id = "coach-styles";
    style.textContent = `
      .coach-panel{margin:18px 0 22px;padding:18px;border:1px solid rgba(101,132,255,.25);border-radius:18px;background:linear-gradient(145deg,rgba(42,63,135,.24),rgba(15,21,42,.68));box-shadow:0 12px 40px rgba(0,0,0,.16)}
      .coach-panel-header{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:14px}.coach-panel h3{margin:3px 0 4px;font-size:1.1rem}.coach-kicker{font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:#8ea5ff;font-weight:800}.coach-badge{font-size:.72rem;padding:6px 9px;border-radius:999px;background:rgba(90,220,150,.12);color:#82e5ad;border:1px solid rgba(90,220,150,.18);white-space:nowrap}.coach-target{padding:14px;border-radius:14px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.07)}.coach-target strong{display:block;margin-bottom:5px;font-size:1rem}.coach-target p{margin:0;color:#b9c2d8;line-height:1.45;font-size:.9rem}.coach-next{display:grid;gap:8px;margin-top:12px}.coach-next-item{display:flex;gap:9px;align-items:flex-start;color:#b9c2d8;font-size:.86rem}.coach-next-item b{color:#fff}.coach-source-list{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px}.coach-source-list a{font-size:.72rem;color:#aabaff;text-decoration:none;border:1px solid rgba(130,153,255,.22);background:rgba(78,105,220,.1);padding:6px 8px;border-radius:999px}.coach-source-list a:hover{background:rgba(78,105,220,.2)}
      .coach-tip{margin-top:9px;border-top:1px solid rgba(255,255,255,.07);padding-top:8px}.coach-tip summary{cursor:pointer;color:#aebdff;font-weight:700;font-size:.82rem;list-style:none}.coach-tip summary::-webkit-details-marker{display:none}.coach-tip summary::before{content:'💡 ';}.coach-tip p{margin:7px 0;color:#b9c2d8;font-size:.82rem;line-height:1.5}.coach-tip-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.coach-tip-meta span{font-size:.67rem;color:#7f8ba8}.coach-tip-meta a{font-size:.67rem;color:#91a6ff;text-decoration:none}.coach-empty{color:#aab2c8;font-size:.88rem;line-height:1.5}.coach-roadmap-progress{font-size:.76rem;color:#8e9ab7;margin-top:7px}
      @media(max-width:620px){.coach-panel-header{flex-direction:column}.coach-badge{align-self:flex-start}}
    `;
    document.head.appendChild(style);
  }

  async function fetchOptional(path) {
    const response = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  }

  async function loadGuide(id) {
    if (coachState.guides.has(id)) return coachState.guides.get(id);

    try {
      const guide = await fetchOptional(`./guides/${id}.json`);
      coachState.guides.set(id, guide);
      return guide;
    } catch (error) {
      console.warn("Impossible de charger le guide de trophées", id, error);
      coachState.guides.set(id, null);
      return null;
    }
  }

  async function loadGame(id) {
    if (coachState.games.has(id)) return coachState.games.get(id);

    try {
      const data = await fetchOptional(`./data/games/${id}.json`);
      const game = data?.game ?? null;
      coachState.games.set(id, game);
      return game;
    } catch (error) {
      console.warn("Impossible de charger le détail des trophées", id, error);
      coachState.games.set(id, null);
      return null;
    }
  }

  function sourceMap(guide) {
    return new Map((guide?.sources ?? []).map((source) => [source.id, source]));
  }

  function findCuratedTip(guide, trophy) {
    const exact = guide?.trophies?.[trophy.name];
    if (exact) return { ...exact, curated: true };

    const searchable = `${trophy.name || ""} ${trophy.description || ""}`.toLowerCase();
    const pattern = (guide?.patternTips ?? []).find((rule) =>
      (rule.contains ?? []).some((needle) => searchable.includes(String(needle).toLowerCase()))
    );

    return pattern ? { ...pattern, curated: true } : null;
  }

  function fallbackTip(trophy) {
    const text = `${trophy.name || ""} ${trophy.description || ""}`.toLowerCase();

    if (trophy.earned) {
      return "Ce trophée est déjà obtenu : aucun détour à prévoir. Garde ton attention sur les objectifs encore manquants.";
    }
    if (trophy.type === "platinum") {
      return "Le platine se débloquera automatiquement après les autres trophées requis. Ne le cible pas directement : avance simplement sur la liste restante.";
    }
    if (text.includes("complete all") || text.includes("obtain all") || text.includes("acquire all")) {
      return "Traite ce trophée comme une checklist de long terme. Fais avancer ses prérequis dès que tu les rencontres plutôt que de garder tout le nettoyage pour la fin.";
    }
    if (text.includes("reach level") || text.includes("level ")) {
      return "Combine le niveau demandé avec un autre objectif de la même partie ou sauvegarde. Favorise l'expérience et évite de lancer une session uniquement pour monter le niveau.";
    }
    if (text.includes("survive") || text.includes("minute")) {
      return "Construis d'abord un build fiable, puis profite du temps de survie pour accomplir un autre objectif compatible au lieu de simplement attendre le chrono.";
    }
    if (text.includes("find") || text.includes("discover")) {
      return "Considère-le comme un objectif d'exploration. Vérifie la carte, les marqueurs disponibles et les prérequis du stage ou de l'histoire avant de lancer une partie dédiée.";
    }
    if (text.includes("defeat") || text.includes("eliminate") || text.includes("kill")) {
      return "Avant de farmer ce combat, vérifie si la cible peut être combinée avec un objectif de stage, de quête, de diplomatie ou un compteur cumulatif pour faire avancer plusieurs trophées en même temps.";
    }
    if (text.includes("build") || text.includes("place") || text.includes("set up") || text.includes("socket")) {
      return "Prépare d'abord l'espace, les ressources et les prérequis, puis fais cet objectif pendant ton développement normal afin d'éviter de devoir reconstruire ton installation plus tard.";
    }
    if (text.includes("trade") || text.includes("route")) {
      return "Intègre cet objectif à ton réseau commercial global. Une configuration bien pensée peut souvent faire avancer plusieurs trophées économiques en même temps.";
    }

    return `Condition PSN : ${trophy.description || "remplir l'objectif indiqué"}. Essaie de la combiner avec un autre trophée du même stage, personnage ou système de jeu.`;
  }

  function findTip(guide, trophy) {
    const curated = findCuratedTip(guide, trophy);
    return curated ?? { tip: fallbackTip(trophy), sourceIds: [], curated: false };
  }

  function recommendationFor(game, guide) {
    const missing = (game?.trophies ?? []).filter((trophy) => !trophy.earned && trophy.type !== "platinum");
    const missingNames = new Set(missing.map((trophy) => trophy.name));
    const roadmap = guide?.roadmap ?? [];
    const remainingRoadmap = roadmap.filter((entry) => missingNames.has(entry.name));

    if (remainingRoadmap.length) {
      return {
        target: remainingRoadmap[0],
        next: remainingRoadmap.slice(1, 4),
        completed: roadmap.length - remainingRoadmap.length,
        total: roadmap.length,
      };
    }

    const fallback = [...missing].sort((a, b) => Number(a.id) - Number(b.id));
    return {
      target: fallback[0]
        ? { name: fallback[0].name, reason: "C'est le prochain trophée manquant détecté dans la liste détaillée." }
        : null,
      next: fallback.slice(1, 4).map((trophy) => ({
        name: trophy.name,
        reason: "Toujours manquant dans ta progression PSN actuelle.",
      })),
      completed: 0,
      total: 0,
    };
  }

  function renderSourceLinks(guide, sourceIds = []) {
    if (!guide || !sourceIds.length) return "";
    const sources = sourceMap(guide);

    return sourceIds
      .map((id) => sources.get(id))
      .filter(Boolean)
      .map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a>`)
      .join("");
  }

  function buildCoachPanel(game, guide) {
    const recommendation = recommendationFor(game, guide);
    const target = recommendation.target;
    const panel = document.createElement("section");
    panel.className = "coach-panel";
    panel.dataset.coachFor = game.npCommunicationId;

    const sourceLinks = (guide?.sources ?? []).slice(0, 4).map((source) =>
      `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a>`
    ).join("");

    panel.innerHTML = `
      <div class="coach-panel-header">
        <div>
          <span class="coach-kicker">Coach platine</span>
          <h3>Prochain objectif recommandé</h3>
        </div>
        <span class="coach-badge">${guide ? `Guide recherché · ${escapeHtml(guide.researchedAt || "")}` : "Conseil automatique"}</span>
      </div>
      ${guide?.strategy ? `<p class="coach-empty" style="margin-top:-4px">${escapeHtml(guide.strategy)}</p>` : ""}
      ${target ? `
        <div class="coach-target">
          <strong>🎯 ${escapeHtml(target.name)}</strong>
          <p>${escapeHtml(target.reason || "Recommandé d'après ta progression actuelle.")}</p>
          ${recommendation.total ? `<div class="coach-roadmap-progress">Progression de la roadmap : ${recommendation.completed}/${recommendation.total} étapes déjà validées</div>` : ""}
        </div>
        ${recommendation.next.length ? `<div class="coach-next">${recommendation.next.map((entry, index) => `
          <div class="coach-next-item"><span>${index + 2}.</span><div><b>${escapeHtml(entry.name)}</b><br>${escapeHtml(entry.reason || "")}</div></div>
        `).join("")}</div>` : ""}
      ` : `<div class="coach-empty">✨ Aucun trophée non-platine restant n'a été détecté dans la liste détaillée.</div>`}
      ${sourceLinks ? `<div class="coach-source-list">${sourceLinks}</div>` : ""}
    `;

    return panel;
  }

  function decorateTrophyRows(game, guide) {
    const rows = [...document.querySelectorAll("#drawerContent .trophy-row")];
    if (!rows.length) return;

    const trophyByName = new Map((game?.trophies ?? []).map((trophy) => [trophy.name, trophy]));

    for (const row of rows) {
      if (row.querySelector(".coach-tip")) continue;

      const name = row.querySelector("strong")?.textContent?.trim();
      const trophy = trophyByName.get(name);
      if (!trophy) continue;

      const advice = findTip(guide, trophy);
      const details = document.createElement("details");
      details.className = "coach-tip";

      const links = renderSourceLinks(guide, advice.sourceIds ?? []);
      details.innerHTML = `
        <summary>${advice.curated ? "Conseil de guide" : "Conseil rapide"}</summary>
        <p>${escapeHtml(advice.tip)}</p>
        <div class="coach-tip-meta">
          <span>${advice.curated ? "Conseil recoupé avec des guides" : "Conseil généré à partir de la condition du trophée"}</span>
          ${links}
        </div>
      `;

      const textContainer = row.querySelector("div");
      (textContainer || row).appendChild(details);
    }
  }

  async function renderCoach() {
    const drawer = document.querySelector("#gameDrawer.is-open");
    const content = document.querySelector("#drawerContent");
    const id = coachState.activeGameId;
    if (!drawer || !content || !id) return;

    const [game, guide] = await Promise.all([loadGame(id), loadGuide(id)]);
    if (!game || coachState.activeGameId !== id) return;

    const stats = content.querySelector(".drawer-stats");
    if (stats && !content.querySelector(`.coach-panel[data-coach-for="${CSS.escape(id)}"]`)) {
      stats.insertAdjacentElement("afterend", buildCoachPanel(game, guide));
    }

    decorateTrophyRows(game, guide);
  }

  function scheduleRender() {
    if (coachState.pending) return;
    coachState.pending = true;

    requestAnimationFrame(() => {
      coachState.pending = false;
      renderCoach().catch((error) => console.warn("Échec du rendu du coach de trophées", error));
    });
  }

  function init() {
    injectStyles();

    document.addEventListener("click", (event) => {
      const opener = event.target.closest("[data-game-id], [data-open-game]");
      if (opener) {
        coachState.activeGameId = opener.dataset.gameId || opener.dataset.openGame || null;
        scheduleRender();
      }

      if (event.target.closest("#drawerClose") || event.target.closest("#drawerBackdrop")) {
        coachState.activeGameId = null;
      }
    }, true);

    const drawerContent = document.querySelector("#drawerContent");
    if (drawerContent) {
      new MutationObserver(scheduleRender).observe(drawerContent, {
        childList: true,
        subtree: true,
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
