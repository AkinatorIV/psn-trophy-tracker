import fs from "node:fs/promises";

import {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  getUserTitles,
  getTitleTrophies,
  getUserTrophiesEarnedForTitle,
} from "psn-api";

const npsso = process.env.PSN_NPSSO;

if (!npsso) {
  throw new Error("PSN_NPSSO manquant");
}

// Auth PSN
const accessCode = await exchangeNpssoForAccessCode(npsso);
const authorization = await exchangeAccessCodeForAuthTokens(accessCode);

const auth = {
  accessToken: authorization.accessToken,
};

// Récupère les jeux liés au compte
const titlesResponse = await getUserTitles(auth, "me", {
  limit: 200,
});

// Cherche Vampire Survivors
const game = titlesResponse.trophyTitles.find((title) =>
  title.trophyTitleName?.toLowerCase().includes("vampire survivors")
);

if (!game) {
  console.error("❌ Vampire Survivors introuvable");
  console.log(
    titlesResponse.trophyTitles.map((g) => g.trophyTitleName)
  );
  process.exit(1);
}

console.log(`🎮 Jeu trouvé : ${game.trophyTitleName}`);

const isPS5 = game.trophyTitlePlatform?.includes("PS5");

const npServiceName = isPS5 ? "trophy2" : "trophy";

// Infos des trophées
const details = await getTitleTrophies(
  auth,
  game.npCommunicationId,
  "all",
  {
    npServiceName,
    limit: 500,
  }
);

// Trophées réellement obtenus par ton compte
const earnedResponse =
  await getUserTrophiesEarnedForTitle(
    auth,
    "me",
    game.npCommunicationId,
    "all",
    {
      npServiceName,
      limit: 500,
    }
  );

const earnedById = new Map(
  earnedResponse.trophies.map((trophy) => [
    trophy.trophyId,
    trophy,
  ])
);

const trophies = details.trophies.map((trophy) => {
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

const earnedCount = trophies.filter((t) => t.earned).length;

const output = {
  psnId: "AkinatorII",

  game: {
    name: game.trophyTitleName,
    platform: game.trophyTitlePlatform,
    progress: game.progress,
    npCommunicationId: game.npCommunicationId,

    earnedCount,
    totalCount: trophies.length,

    trophies,
  },
};

await fs.mkdir("data", {
  recursive: true,
});

const filePath = "data/trophies.json";

let previous = null;

try {
  previous = JSON.parse(
    await fs.readFile(filePath, "utf8")
  );
} catch {
  // Premier lancement : pas encore de fichier
}

// On compare seulement les données PSN,
// pas la date de mise à jour
const previousComparable = previous
  ? {
      psnId: previous.psnId,
      game: previous.game,
    }
  : null;

const hasChanged =
  JSON.stringify(previousComparable) !==
  JSON.stringify(output);

if (!hasChanged) {
  console.log(
    `✅ Aucun changement — ${earnedCount}/${trophies.length} trophées`
  );

  process.exit(0);
}

const finalOutput = {
  ...output,
  updatedAt: new Date().toISOString(),
};

await fs.writeFile(
  filePath,
  JSON.stringify(finalOutput, null, 2)
);

const previousEarnedIds = new Set(
  previous?.game?.trophies
    ?.filter((t) => t.earned)
    .map((t) => t.id) ?? []
);

const newTrophies = trophies.filter(
  (t) => t.earned && !previousEarnedIds.has(t.id)
);

console.log(
  `🏆 ${earnedCount}/${trophies.length} trophées obtenus`
);

if (newTrophies.length > 0) {
  console.log("🆕 Nouveaux trophées :");

  for (const trophy of newTrophies) {
    console.log(`- ${trophy.name}`);
  }
}

console.log("📄 data/trophies.json mis à jour");
