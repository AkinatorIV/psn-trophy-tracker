import fs from "node:fs/promises";
import path from "node:path";

import {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  getUserTitles,
  getTitleTrophies,
  getUserTrophiesEarnedForTitle,
} from "psn-api";

const PSN_ID = "AkinatorII";
const DATA_DIR = "data";
const GAMES_DIR = path.join(DATA_DIR, "games");
const INDEX_PATH = path.join(DATA_DIR, "index.json");
const ACTIVITY_PATH = path.join(DATA_DIR, "activity.json");
const STATUS_PATH = path.join(DATA_DIR, "status.json");

const INITIAL_DETAIL_GAMES = 10;
const BACKFILL_PER_RUN = 3;
const ACTIVITY_LIMIT = 250;
const STATUS_HEARTBEAT_MS = 12 * 60 * 60 * 1000;

await fs.mkdir(GAMES_DIR, { recursive: true });

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function withoutUpdatedAt(value) {
  if (!value) return value;
  const { updatedAt, ...rest } = value;
  return rest;
}

async function writeJsonIfChanged(filePath, value) {
  const previous = await readJson(filePath);

  const changed =
    JSON.stringify(withoutUpdatedAt(previous)) !==
    JSON.stringify(withoutUpdatedAt(value));

  if (!changed) {
    return { changed: false, previous };
  }

  const next = {
    ...withoutUpdatedAt(value),
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(filePath, JSON.stringify(next, null, 2));
  return { changed: true, previous, next };
}

function gameFileName(npCommunicationId) {
  return `${npCommunicationId}.json`;
}

function gameFilePath(npCommunicationId) {
  return path.join(GAMES_DIR, gameFileName(npCommunicationId));
}

function titleSummary(title) {
  return {
    npCommunicationId: title.npCommunicationId,
    name: title.trophyTitleName,
    platform: title.trophyTitlePlatform,
    progress: title.progress,
    definedTrophies: title.definedTrophies ?? null,
    earnedTrophies: title.earnedTrophies ?? null,
    lastUpdatedDateTime: title.lastUpdatedDateTime ?? null,
  };
}

function progressFingerprint(summary) {
  return JSON.stringify({
    progress: summary.progress,
    definedTrophies: summary.definedTrophies,
    earnedTrophies: summary.earnedTrophies,
  });
}

async function authenticate() {
  const npsso = process.env.PSN_NPSSO;

  if (!npsso) {
    throw new Error("PSN_NPSSO manquant");
  }

  const accessCode = await exchangeNpssoForAccessCode(npsso);
  const authorization = await exchangeAccessCodeForAuthTokens(accessCode);

  return { accessToken: authorization.accessToken };
}

async function getAllUserTitles(auth) {
  const all = [];
  const limit = 800;
  let offset = 0;

  while (true) {
    const response = await getUserTitles(auth, "me", { limit, offset });
    const items = response.trophyTitles ?? [];

    all.push(...items);

    if (
      items.length === 0 ||
      all.length >= (response.totalItemCount ?? all.length) ||
      items.length < limit
    ) {
      break;
    }

    offset += items.length;
  }

  return all;
}

async function getAllTitleTrophies(auth, npCommunicationId, npServiceName) {
  const all = [];
  const limit = 500;
  let offset = 0;

  while (true) {
    const response = await getTitleTrophies(
      auth,
      npCommunicationId,
      "all",
      { npServiceName, limit, offset }
    );

    const items = response.trophies ?? [];
    all.push(...items);

    if (
      items.length === 0 ||
      all.length >= (response.totalItemCount ?? all.length) ||
      items.length < limit
    ) {
      break;
    }

    offset += items.length;
  }

  return all;
}

async function getAllEarnedTrophies(auth, npCommunicationId, npServiceName) {
  const all = [];
  const limit = 500;
  let offset = 0;

  while (true) {
    const response = await getUserTrophiesEarnedForTitle(
      auth,
      "me",
      npCommunicationId,
      "all",
      { npServiceName, limit, offset }
    );

    const items = response.trophies ?? [];
    all.push(...items);

    if (
      items.length === 0 ||
      all.length >= (response.totalItemCount ?? all.length) ||
      items.length < limit
    ) {
      break;
    }

    offset += items.length;
  }

  return all;
}

async function syncGameDetails(auth, title) {
  const npServiceName = title.trophyTitlePlatform?.includes("PS5")
    ? "trophy2"
    : "trophy";

  const filePath = gameFilePath(title.npCommunicationId);
  const targetExists = await exists(filePath);
  const previous = await readJson(filePath);

  const [details, earned] = await Promise.all([
    getAllTitleTrophies(auth, title.npCommunicationId, npServiceName),
    getAllEarnedTrophies(auth, title.npCommunicationId, npServiceName),
  ]);

  const earnedById = new Map(
    earned.map((trophy) => [trophy.trophyId, trophy])
  );

  const trophies = details.map((trophy) => {
    const earnedInfo = earnedById.get(trophy.trophyId);

    return {
      id: trophy.trophyId,
      name: trophy.trophyName,
      description: trophy.trophyDetail,
      type: trophy.trophyType,
      group: trophy.trophyGroupId,
      earned: earnedInfo?.earned ?? false,
      earnedDateTime: earnedInfo?.earnedDateTime ?? null,
    };
  });

  const earnedCount = trophies.filter((trophy) => trophy.earned).length;

  const value = {
    psnId: PSN_ID,
    game: {
      name: title.trophyTitleName,
      platform: title.trophyTitlePlatform,
      progress: title.progress,
      npCommunicationId: title.npCommunicationId,
      earnedCount,
      totalCount: trophies.length,
      trophies,
    },
  };

  const changed =
    !targetExists ||
    JSON.stringify(withoutUpdatedAt(previous)) !== JSON.stringify(value);

  if (!changed) {
    console.log(
      `↔️ ${title.trophyTitleName}: aucun changement (${earnedCount}/${trophies.length})`
    );
    return { changed: false, initialized: false, newTrophies: [] };
  }

  const previousEarnedIds = new Set(
    previous?.game?.trophies
      ?.filter((trophy) => trophy.earned)
      .map((trophy) => trophy.id) ?? []
  );

  const newTrophies = targetExists
    ? trophies.filter(
        (trophy) => trophy.earned && !previousEarnedIds.has(trophy.id)
      )
    : [];

  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        ...value,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  if (!targetExists) {
    console.log(
      `📦 ${title.trophyTitleName}: détail initialisé (${earnedCount}/${trophies.length})`
    );
  } else {
    console.log(
      `🎮 ${title.trophyTitleName}: ${earnedCount}/${trophies.length} trophées`
    );

    if (newTrophies.length > 0) {
      console.log("   🆕 Nouveaux trophées :");
      for (const trophy of newTrophies) {
        console.log(`   - ${trophy.name}`);
      }
    }
  }

  return {
    changed: true,
    initialized: !targetExists,
    newTrophies,
  };
}

async function buildActivity(gameFiles) {
  const entries = [];

  for (const file of gameFiles) {
    const data = await readJson(path.join(GAMES_DIR, file));
    const game = data?.game;

    if (!game?.trophies) continue;

    for (const trophy of game.trophies) {
      if (!trophy.earned || !trophy.earnedDateTime) continue;

      entries.push({
        earnedDateTime: trophy.earnedDateTime,
        game: {
          name: game.name,
          platform: game.platform,
          npCommunicationId: game.npCommunicationId,
        },
        trophy: {
          id: trophy.id,
          name: trophy.name,
          type: trophy.type,
          description: trophy.description,
        },
      });
    }
  }

  entries.sort(
    (a, b) => Date.parse(b.earnedDateTime) - Date.parse(a.earnedDateTime)
  );

  return {
    psnId: PSN_ID,
    recent: entries.slice(0, ACTIVITY_LIMIT),
  };
}

function statusHeartbeatDue(previous) {
  if (!previous?.checkedAt) return true;

  const checkedAt = Date.parse(previous.checkedAt);
  if (Number.isNaN(checkedAt)) return true;

  return Date.now() - checkedAt >= STATUS_HEARTBEAT_MS;
}

async function writeSuccessStatus({ totalGames, detailedGames }) {
  const previous = await readJson(STATUS_PATH);

  const stateChanged =
    !previous ||
    previous.healthy !== true ||
    previous.totalGames !== totalGames ||
    previous.detailedGames !== detailedGames ||
    previous.lastError !== null;

  if (!stateChanged && !statusHeartbeatDue(previous)) {
    return false;
  }

  const now = new Date().toISOString();

  await fs.writeFile(
    STATUS_PATH,
    JSON.stringify(
      {
        psnId: PSN_ID,
        healthy: true,
        checkedAt: now,
        lastSuccessfulSync: now,
        totalGames,
        detailedGames,
        lastError: null,
      },
      null,
      2
    )
  );

  return true;
}

async function writeFailureStatus(error) {
  const previous = await readJson(STATUS_PATH);
  const message = error instanceof Error ? error.message : String(error);

  const stateChanged =
    !previous ||
    previous.healthy !== false ||
    previous?.lastError?.message !== message;

  if (!stateChanged && !statusHeartbeatDue(previous)) {
    return false;
  }

  await fs.writeFile(
    STATUS_PATH,
    JSON.stringify(
      {
        psnId: PSN_ID,
        healthy: false,
        checkedAt: new Date().toISOString(),
        lastSuccessfulSync: previous?.lastSuccessfulSync ?? null,
        totalGames: previous?.totalGames ?? null,
        detailedGames: previous?.detailedGames ?? null,
        lastError: {
          message,
        },
      },
      null,
      2
    )
  );

  return true;
}

async function main() {
  const auth = await authenticate();
  const titles = await getAllUserTitles(auth);

  console.log(`🎮 ${titles.length} jeux avec trophées trouvés sur le compte`);

  const summaries = titles.map(titleSummary);
  const previousIndex = await readJson(INDEX_PATH);
  const previousById = new Map(
    previousIndex?.games?.map((game) => [game.npCommunicationId, game]) ?? []
  );

  const existingGameFiles = new Set(
    (await fs.readdir(GAMES_DIR)).filter((file) => file.endsWith(".json"))
  );

  const detailsToSync = new Map();

  if (!previousIndex) {
    for (const title of titles.slice(0, INITIAL_DETAIL_GAMES)) {
      detailsToSync.set(title.npCommunicationId, title);
    }
  } else {
    for (const title of titles) {
      const current = titleSummary(title);
      const previous = previousById.get(title.npCommunicationId);

      if (
        !previous ||
        progressFingerprint(previous) !== progressFingerprint(current)
      ) {
        detailsToSync.set(title.npCommunicationId, title);
      }
    }
  }

  let backfillAdded = 0;

  for (const title of titles) {
    if (backfillAdded >= BACKFILL_PER_RUN) break;

    const fileName = gameFileName(title.npCommunicationId);

    if (
      !existingGameFiles.has(fileName) &&
      !detailsToSync.has(title.npCommunicationId)
    ) {
      detailsToSync.set(title.npCommunicationId, title);
      backfillAdded += 1;
    }
  }

  let detailedChanges = 0;
  let initializedGames = 0;
  let newTrophyCount = 0;

  for (const title of detailsToSync.values()) {
    try {
      const result = await syncGameDetails(auth, title);

      if (result.changed) detailedChanges += 1;
      if (result.initialized) initializedGames += 1;
      newTrophyCount += result.newTrophies.length;
    } catch (error) {
      console.warn(
        `⚠️ Impossible de synchroniser le détail de ${title.trophyTitleName}: ${error.message}`
      );
    }
  }

  const gameFiles = (await fs.readdir(GAMES_DIR)).filter((file) =>
    file.endsWith(".json")
  );
  const gameFileSet = new Set(gameFiles);
  const detailedGames = gameFiles.length;
  const backfillRemaining = Math.max(0, summaries.length - detailedGames);

  const indexValue = {
    psnId: PSN_ID,
    totalGames: summaries.length,
    detailedGames,
    backfillRemaining,
    games: summaries.map((game) => ({
      ...game,
      detailsPath: gameFileSet.has(gameFileName(game.npCommunicationId))
        ? `data/games/${gameFileName(game.npCommunicationId)}`
        : null,
    })),
  };

  const indexResult = await writeJsonIfChanged(INDEX_PATH, indexValue);
  const activityResult = await writeJsonIfChanged(
    ACTIVITY_PATH,
    await buildActivity(gameFiles)
  );
  const statusChanged = await writeSuccessStatus({
    totalGames: summaries.length,
    detailedGames,
  });

  if (indexResult.changed) {
    console.log("📚 Index des jeux mis à jour");
  } else {
    console.log("✅ Index inchangé");
  }

  if (activityResult.changed) {
    console.log("🕒 Historique d’activité mis à jour");
  }

  if (statusChanged) {
    console.log("💚 État de santé du tracker mis à jour");
  }

  if (backfillRemaining > 0) {
    console.log(
      `📥 Backfill : ${detailedGames}/${summaries.length} jeux détaillés, ${backfillRemaining} restant(s)`
    );
  } else {
    console.log("✅ Tous les jeux disposent de leur détail de trophées");
  }

  if (
    !indexResult.changed &&
    !activityResult.changed &&
    !statusChanged &&
    detailedChanges === 0
  ) {
    console.log("✅ Aucune progression PSN détectée");
  } else {
    console.log(
      `🏆 Synchronisation terminée : ${detailedChanges} jeu(x) modifié(s), ${initializedGames} initialisé(s), ${newTrophyCount} nouveau(x) trophée(s)`
    );
  }
}

try {
  await main();
} catch (error) {
  await writeFailureStatus(error);
  console.error("❌ Synchronisation PSN échouée:", error);
  process.exitCode = 1;
}
