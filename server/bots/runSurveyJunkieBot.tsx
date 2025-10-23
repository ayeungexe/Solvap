import { runSurveyJunkieBotCli } from "./surveyJunkieBot.tsx";

void runSurveyJunkieBotCli().catch((error) => {
  console.error("Survey Junkie automation failed:", error);
  process.exitCode = 1;
});
