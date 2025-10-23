# Solvap

## Survey Junkie automation bot

This repository now includes a headless browser bot that can automatically log into [Survey Junkie](https://app.surveyjunkie.com/) and attempt to complete an available survey. The automation is implemented with [Puppeteer](https://pptr.dev/) and lives in [`server/bots/surveyJunkieBot.ts`](server/bots/surveyJunkieBot.ts).

### Prerequisites

1. Install dependencies:
   ```bash
   npm install
   ```
2. Provide your Survey Junkie credentials either through environment variables or CLI flags:
   - `SURVEYJUNKIE_EMAIL`
   - `SURVEYJUNKIE_PASSWORD`

### Running the bot

Use the bundled npm script to execute the bot via `tsx`:

```bash
SURVEYJUNKIE_EMAIL="you@example.com" \
SURVEYJUNKIE_PASSWORD="hunter2" \
npm run surveyjunkie:bot -- --max-steps=25
```

Key CLI options:

- `--survey=<url>` – optional direct link to a specific Survey Junkie survey.
- `--headless=false` – run the browser with a visible window for debugging.
- `--max-steps=<number>` – cap the number of survey pages the bot will attempt.
- `--idle-timeout=<milliseconds>` – override the network idle timeout used between steps.

> **Important:** Automated survey completion may violate Survey Junkie's terms of service. Use this tool responsibly and only on accounts you own.

### How it works

The bot performs the following high-level flow:

1. Launches a Puppeteer-controlled Chromium instance (headless by default).
2. Logs into the Survey Junkie dashboard using the supplied credentials.
3. Starts the first available survey (or the survey URL you provide).
4. Iteratively selects answers for radio buttons, checkboxes, selects, and text inputs using lightweight heuristics.
5. Attempts to progress through survey pages until completion text is detected or the maximum step count is reached.

All network-heavy assets such as images and fonts are blocked to keep the automation lightweight.
