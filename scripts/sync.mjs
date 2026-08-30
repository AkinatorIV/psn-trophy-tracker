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
const LEGACY_PATH = path.join(DATA_DIR, "trophies.json");
const INITIAL_DETAIL_GAMES = 10;

const npsso = process.env.PSN_NPSSO;

if (!npsso) {
  throw new Error("PSN_NPSSO manquant");
}

const accessCode = await exchangeNpssoForAccessCode(npsso);
const authorization = await exchangeAccessCodeForAuthTokens(accessCode);
const auth = { accessToken: authorization.accessToken };

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

async function getAllUserTitles() {
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

async function getAllTitleTrophies(npCommunicationId, npServiceName) {
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

async function getAllEarnedTrophies(npCommunicationId, npServiceName) {
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

async function syncGameDetails(title, legacyData = null) {
  const npServiceName = title.trophyTitlePlatform?.includes("PS5")
    ? "trophy2"
    : "trophy";

  const [details, earned] = await Promise.all([
    getAllTitleTrophies(title.npCommunicationId, npServiceName),
    getAllEarnedTrophies(title.npCommunicationId, npServiceName),
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
  const filePath = gameFilePath(title.npCommunicationId);
  const targetExists = await exists(filePath);

  let previous = await readJson(filePath);
  if (
    !previous &&
    legacyData?.game?.npCommunicationId === title.npCommunicationId
  ) {
    previous = legacyData;
  }

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

  const comparablePrevious = previous
    ? withoutUpdatedAt(previous)
    : null;
  const changed =
    !targetExists ||
    JSON.stringify(comparablePrevious) !== JSON.stringify(value);

  if (!changed) {
    console.log(
      `↔️ ${title.trophyTitleName}: aucun changement (${earnedCount}/${trophies.length})`
    );
    return false;
  }

  const previousEarnedIds = new Set(
    previous?.game?.trophies
      ?.filter((trophy) => trophy.earned)
      .map((trophy) => trophy.id) ?? []
  );

  const newTrophies = trophies.filter(
    (trophy) => trophy.earned && !previousEarnedIds.has(trophy.id)
  );

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

  console.log(
    `🎮 ${title.trophyTitleName}: ${earnedCount}/${trophies.length} trophées`
  );

  if (newTrophies.length > 0) {
    console.log("   🆕 Nouveaux trophées :");
    for (const trophy of newTrophies) {
      console.log(`   - ${trophy.name}`);
    }
  }

  return true;
}

const titles = await getAllUserTitles();
console.log(`🎮 ${titles.length} jeux avec trophées trouvés sur le compte`);

const summaries = titles.map(titleSummary);
const previousIndex = await readJson(INDEX_PATH);
const legacyData = await readJson(LEGACY_PATH);

const previousById = new Map(
  previousIndex?.games?.map((game) => [game.npCommunicationId, game]) ?? []
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

if (legacyData?.game?.npCommunicationId) {
  const legacyTitle = titles.find(
    (title) =>
      title.npCommunicationId === legacyData.game.npCommunicationId
  );

  if (legacyTitle) {
    detailsToSync.set(legacyTitle.npCommunicationId, legacyTitle);
  }
}

let detailedChanges = 0;

for (const title of detailsToSync.values()) {
  try {
    const changed = await syncGameDetails(title, legacyData);
    if (changed) detailedChanges += 1;
  } catch (error) {
    console.warn(
      `⚠️ Impossible de synchroniser le détail de ${title.trophyTitleName}: ${error.message}`
    );
  }
}

const gameFiles = new Set(
  (await fs.readdir(GAMES_DIR)).filter((file) => file.endsWith(".json"))
);

const indexValue = {
  psnId: PSN_ID,
  totalGames: summaries.length,
  games: summaries.map((game) => ({
    ...game,
    detailsPath: gameFiles.has(gameFileName(game.npCommunicationId))
      ? `data/games/${gameFileName(game.npCommunicationId)}`
      : null,
  })),
};

const indexResult = await writeJsonIfChanged(INDEX_PATH, indexValue);

if (indexResult.changed) {
  console.log("📚 Index des jeux mis à jour");
} else {
  console.log("✅ Index inchangé");
}

if (!indexResult.changed && detailedChanges === 0) {
  console.log("✅ Aucune progression PSN détectée");
} else {
  console.log(
    `🏆 Synchronisation terminée : ${detailedChanges} jeu(x) détaillé(s) modifié(s)`
  );
}
