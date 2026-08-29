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
  updatedAt: new Date().toISOString(),

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

await fs.writeFile(
  "data/trophies.json",
  JSON.stringify(output, null, 2)
);

console.log(
  `✅ ${earnedCount}/${trophies.length} trophées obtenus`
);

console.log("📄 data/trophies.json généré");
