import {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  getUserTitles,
} from "psn-api";

const npsso = process.env.PSN_NPSSO;

if (!npsso) {
  console.error("❌ Variable PSN_NPSSO absente");
  process.exit(1);
}

console.log("🔐 Connexion au PSN...");

const accessCode = await exchangeNpssoForAccessCode(npsso);
const authorization = await exchangeAccessCodeForAuthTokens(accessCode);

console.log("✅ Authentification réussie");

const titles = await getUserTitles(
  { accessToken: authorization.accessToken },
  "me",
  { limit: 10 }
);

console.log("\n🎮 Jeux trouvés :");

for (const game of titles.trophyTitles) {
  console.log(
    `- ${game.trophyTitleName} | ${game.progress}% | ${game.trophyTitlePlatform}`
  );
}
