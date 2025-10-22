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
- `--answers=<path>` – optional path to an Excel workbook containing reusable answers.
- `--gpt-long-form=true` – enable GPT powered long-form textarea responses (requires `OPENAI_API_KEY`).
- `--openai-api-key=<key>` – override the OpenAI key for the long-form agent just for this run.
- `--gpt-model=<model>` – override the default OpenAI model used for long-form answers.
- `--gpt-prompt=<prompt>` – supply a custom system prompt for the GPT long-form agent.

> **Important:** Automated survey completion may violate Survey Junkie's terms of service. Use this tool responsibly and only on accounts you own.

### How it works

The bot performs the following high-level flow:

1. Launches a Puppeteer-controlled Chromium instance (headless by default) hardened with `puppeteer-extra`'s stealth plugin.
2. Randomises the browser fingerprint (user agent, viewport, timezone, and locale) and drives the cursor along smooth, physical mouse paths (with overshoots and drifts) before every interaction to avoid "teleporting" clicks.
3. Logs into the Survey Junkie dashboard using the supplied credentials.
4. Starts the first available survey (or the survey URL you provide).
5. Iteratively selects answers for radio buttons, checkboxes, selects, and text inputs using lightweight heuristics or configured workbook values, while prioritising any detected attention-check instructions.
6. Waits with human-like pauses between actions and advances until completion text is detected or the maximum step count is reached.

To keep the session looking natural, only streaming media requests are blocked; images, fonts, and other assets continue loading as they would in a normal browser.

### Providing consistent answers

You can instruct the automation to reuse specific responses by supplying an Excel workbook via the `--answers` flag. The bot reads the first worksheet and expects the following columns:

| Column | Purpose |
| ------ | ------- |
| `Question` | Text that roughly matches the survey prompt. |
| `Keywords` | Optional comma-separated fallback keywords used when the question text does not match exactly. |
| `Answers` | One or more pipe-separated answer values (e.g. `Female` or `Red|Blue`). |

When the bot encounters an input whose prompt matches a `Question` (or contains one of the `Keywords`), it will try to apply the corresponding `Answers` to radios, checkboxes, selects, inputs, and textareas before falling back to heuristic behaviour. This allows you to keep answers consistent across runs without editing the code.

A text-based sample dataset is available at [`server/bots/sample-data/survey-answers.csv`](server/bots/sample-data/survey-answers.csv). Open it in Excel (or Google Sheets) and export it as an `.xlsx` workbook before pointing the bot at the file, since binary spreadsheets are not stored in this repository.

### Attention checks and trap questions

Survey Junkie (and third-party survey platforms) occasionally insert "attention check" prompts that ask respondents to pick a specific option or type a particular word. The bot analyses each prompt for this language and, when detected, will:

- Select the requested radio/checkbox/select option by matching the quoted text, colour name, or explicit option number.
- Prefer any options containing attention-focused keywords (e.g. "I am paying attention" or "I read the instructions") when quality-check text is present.
- Type mandatory phrases or numbers into text inputs and long-form textareas when instructed (for example "enter 123" or "type the word blue").

These safeguards run before answer-bank lookups so workbook preferences continue to work without overriding attention checks.

### GPT generated long-form answers

Textareas that look like open-ended questions (for example those with 3+ rows, explicit minimum character requirements, or lengthy prompts) can be filled with a GPT agent instead of the default canned response. To enable it:

1. Export your OpenAI key in the environment (or pass `--openai-api-key` on the CLI):
   ```bash
   export OPENAI_API_KEY="sk-your-key"
   ```
2. Run the bot with the long-form flag:
   ```bash
   npm run surveyjunkie:bot -- --gpt-long-form=true --max-steps=25
   ```

Optional flags let you swap the target model (`--gpt-model=gpt-4.1-mini`) or override the base system prompt (`--gpt-prompt="..."`).
The default system prompt baked into the bot is listed below so you can reuse or tweak it inside your own GPT agent tooling:

```
You are helping complete market research surveys. Provide sincere, first-person answers that sound natural and specific.
```

The automation sends the detected survey question along with this prompt and asks for a concise, 3–5 sentence reply. If the GPT request fails for any reason the script falls back to the textarea placeholder (or a generic message) so that the field is never left blank.
