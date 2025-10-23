import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, ElementHandle, Frame, HTTPRequest, JSHandle, Page } from "puppeteer";
import { setTimeout as delay } from "node:timers/promises";
import { SurveyAnswerBank } from "./surveyAnswerBank.ts";
import type { SerializedAnswerEntry } from "./surveyAnswerBank.ts";
import { GptLongFormResponder } from "./gptLongFormResponder.ts";

const puppeteer = puppeteerExtra.use(StealthPlugin());

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
];

const ACCEPT_LANGUAGES = [
  "en-US,en;q=0.9",
  "en-GB,en;q=0.8",
  "en-CA,en;q=0.8",
  "en-AU,en;q=0.8",
];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Denver",
  "Europe/London",
];

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
];

type LongFormTarget = {
  key: string;
  prompt: string;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
  rows?: number;
};

export type SurveyJunkieBotOptions = {
  email: string;
  password: string;
  surveyUrl?: string;
  headless?: boolean;
  idleTimeoutMs?: number;
  maxSteps?: number;
  answerWorkbookPath?: string;
  useGptLongForm?: boolean;
  openAIApiKey?: string;
  gptModel?: string;
  gptPrompt?: string;
};

export class SurveyJunkieBot {
  private browser?: Browser;
  private page?: Page;
  private answerBank?: SurveyAnswerBank;
  private readonly longFormResponder?: GptLongFormResponder;
  private readonly options: {
    email: string;
    password: string;
    surveyUrl?: string;
    headless: boolean;
    idleTimeoutMs: number;
    maxSteps: number;
    answerWorkbookPath?: string;
    useGptLongForm: boolean;
    openAIApiKey?: string;
    gptModel?: string;
    gptPrompt?: string;
  };
  private readonly humanProfile: {
    userAgent: string;
    language: string;
    timezone: string;
    viewport: { width: number; height: number };
  };
  private mousePosition?: { x: number; y: number };

  constructor(options: SurveyJunkieBotOptions) {
    if (!options.email) {
      throw new Error("A Survey Junkie email address is required.");
    }

    if (!options.password) {
      throw new Error("A Survey Junkie password is required.");
    }

    this.options = {
      email: options.email,
      password: options.password,
      surveyUrl: options.surveyUrl,
      headless: typeof options.headless === "boolean" ? options.headless : true,
      idleTimeoutMs: options.idleTimeoutMs ?? 15_000,
      maxSteps: options.maxSteps ?? 35,
      answerWorkbookPath: options.answerWorkbookPath,
      useGptLongForm: Boolean(options.useGptLongForm),
      openAIApiKey: options.openAIApiKey,
      gptModel: options.gptModel,
      gptPrompt: options.gptPrompt,
    };

    this.humanProfile = {
      userAgent: this.pickRandom(USER_AGENTS),
      language: this.pickRandom(ACCEPT_LANGUAGES),
      timezone: this.pickRandom(TIMEZONES),
      viewport: this.pickRandom(VIEWPORTS),
    };

    if (this.options.useGptLongForm) {
      if (!this.options.openAIApiKey) {
        throw new Error("OpenAI API key is required when GPT long-form responses are enabled.");
      }

      this.longFormResponder = new GptLongFormResponder({
        apiKey: this.options.openAIApiKey,
        model: this.options.gptModel,
        basePrompt: this.options.gptPrompt,
      });
    }
  }

  async run(): Promise<void> {
    await this.launch();

    try {
      await this.loadAnswerBank();
      await this.login();
      await this.navigateToSurvey();
      await this.answerSurvey();
    } finally {
      await this.close();
    }
  }

  private async launch(): Promise<void> {
    if (this.browser) {
      return;
    }

    const primaryLanguage = this.humanProfile.language.split(",")[0] ?? "en-US";
    this.browser = await puppeteer.launch({
      headless: this.options.headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        `--lang=${primaryLanguage}`,
        `--window-size=${this.humanProfile.viewport.width},${this.humanProfile.viewport.height}`,
      ],
      defaultViewport: this.humanProfile.viewport,
    });

    const browser = this.browser;
    if (!browser) {
      throw new Error("Failed to initialize the browser instance.");
    }

    this.page = await browser.newPage();

    await this.preparePage(this.page);
    await this.seedMousePosition(this.page);

    await this.page.setRequestInterception(true);
    this.page.on("request", (request: HTTPRequest) => {
      if (request.resourceType() === "media") {
        request.abort().catch(() => undefined);
        return;
      }

      request.continue().catch(() => undefined);
    });
  }

  private async preparePage(page: Page): Promise<void> {
    const [primaryLanguage] = this.humanProfile.language.split(",");
    const fallbackLanguage = primaryLanguage?.split("-")?.[0] ?? "en";
    const platform = this.humanProfile.userAgent.includes("Macintosh")
      ? "MacIntel"
      : this.humanProfile.userAgent.includes("Linux")
        ? "Linux x86_64"
        : "Win32";

    await page.setUserAgent(this.humanProfile.userAgent);
    await page.setExtraHTTPHeaders({ "Accept-Language": this.humanProfile.language });

    try {
      await page.emulateTimezone(this.humanProfile.timezone);
    } catch (error) {
      // Some environments may not support timezone emulation; ignore failures.
    }

    await page.setViewport(this.humanProfile.viewport);

    const hardwareConcurrency = Math.round(this.randomBetween(6, 12));

    await page.evaluateOnNewDocument(
      ({ primary, fallback, platformHint, cores }) => {
        Object.defineProperty(navigator, "language", { get: () => primary });
        Object.defineProperty(navigator, "languages", { get: () => [primary, fallback] });
        Object.defineProperty(navigator, "platform", { get: () => platformHint });
        Object.defineProperty(navigator, "maxTouchPoints", { get: () => 0 });
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
        Object.defineProperty(navigator, "hardwareConcurrency", { get: () => cores });
      },
      {
        primary: primaryLanguage ?? "en-US",
        fallback: fallbackLanguage,
        platformHint: platform,
        cores: hardwareConcurrency,
      },
    );

    await this.jitterMouse(page, 3);
    await this.humanPause(240, 480);
  }

  private async loadAnswerBank(): Promise<void> {
    if (!this.options.answerWorkbookPath || this.answerBank) {
      return;
    }

    try {
      this.answerBank = await SurveyAnswerBank.fromWorkbook(this.options.answerWorkbookPath);
      console.info(
        `Loaded ${this.answerBank.size} configured survey answers from ${this.options.answerWorkbookPath}.`,
      );
    } catch (error) {
      console.warn(
        `Unable to load the survey answers workbook at ${this.options.answerWorkbookPath}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  private async close(): Promise<void> {
    await this.page?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
  }

  private getPage(): Page {
    if (!this.page) {
      throw new Error("The browser page has not been initialised yet.");
    }

    return this.page;
  }

  private async login(): Promise<void> {
    const page = this.getPage();

    await page.goto("https://app.surveyjunkie.com/login", {
      waitUntil: "networkidle2",
    });

    await this.jitterMouse(page, 2);
    await this.humanPause(400, 900);

    const emailSelectors = [
      "input[type=email]",
      "input[name=email]",
      "input[id*=email]",
    ];

    const passwordSelectors = [
      "input[type=password]",
      "input[name=password]",
      "input[id*=password]",
    ];

    const submitSelectors = [
      "css:button[type=submit]",
      "css:button[data-qa=login]",
      "css:button[id*=login]",
      "css:[role=button][data-qa=login]",
      "text:log in",
      "text:sign in",
    ];

    const emailFilled = await this.typeFirstMatching(emailSelectors, this.options.email);
    if (!emailFilled) {
      throw new Error("Unable to locate the email input field on the Survey Junkie login page.");
    }

    const passwordFilled = await this.typeFirstMatching(passwordSelectors, this.options.password);
    if (!passwordFilled) {
      throw new Error("Unable to locate the password input field on the Survey Junkie login page.");
    }

    const clicked = await this.clickFirstMatching(submitSelectors);
    if (!clicked) {
      throw new Error("Unable to locate the login button on the Survey Junkie login page.");
    }

    await Promise.race([
      page.waitForNavigation({ waitUntil: "networkidle2" }),
      delay(3_000),
    ]);

    await delay(1_000);
  }

  private async navigateToSurvey(): Promise<void> {
    const page = this.getPage();

    const target = this.options.surveyUrl ?? "https://app.surveyjunkie.com/dashboard";
    if (page.url() !== target) {
      await page.goto(target, { waitUntil: "domcontentloaded" });
      await this.jitterMouse(page, 2);
      await this.humanPause(500, 1000);
    }

    if (this.options.surveyUrl) {
      return;
    }

    const startSelectors = [
      "text:start survey",
      "text:take survey",
      "css:[data-qa=start-survey]",
      "css:a[href*='/surveys/'] button",
      "css:a[href*='/surveys/']",
    ];

    const started = await this.clickFirstMatching(startSelectors, 10_000);

    if (!started) {
      console.warn(
        "No survey CTA was located on the dashboard. You can provide a specific survey URL using the --survey flag.",
      );
    }

    await delay(2_000);
  }

  private async answerSurvey(): Promise<void> {
    const page = this.getPage();

    for (let step = 0; step < this.options.maxSteps; step += 1) {
      const frame = this.getActiveSurveyFrame();
      if (!frame) {
        console.warn("No active survey frame detected; assuming completion.");
        return;
      }

      const isComplete = await this.hasCompletedSurvey(frame);
      if (isComplete) {
        console.info("Survey completed successfully.");
        return;
      }

      const interacted = await this.answerCurrentStep(frame);
      if (!interacted) {
        console.warn("No interactive elements found on the current step. Stopping automation.");
        return;
      }

      await this.humanPause(240, 520);

      const advanced = await this.advance(frame);
      if (!advanced) {
        console.warn("Unable to progress to the next survey step. Stopping automation.");
        return;
      }

      await this.waitForIdle(page);
    }

    console.warn("Reached the maximum configured number of steps without detecting completion.");
  }

  private getActiveSurveyFrame(): Frame | undefined {
    const page = this.getPage();
    const candidate = page
      .frames()
      .find((frame) => /survey|qualtrics|question|form/i.test(frame.url()) && frame !== page.mainFrame());

    return candidate ?? page.mainFrame();
  }

  private async buildLongFormAnswers(frame: Frame): Promise<Record<string, string>> {
    if (!this.longFormResponder) {
      return {};
    }

    const targets = await frame.evaluate(() => {
      const deriveKey = (textarea: HTMLTextAreaElement, index: number): string => {
        if (textarea.dataset.answerKey) {
          return textarea.dataset.answerKey;
        }

        const key =
          textarea.name ||
          textarea.id ||
          textarea.getAttribute("data-question-id") ||
          textarea.getAttribute("aria-labelledby") ||
          textarea.getAttribute("aria-label") ||
          textarea.placeholder ||
          `textarea-${index}`;

        textarea.dataset.answerKey = key;
        return key;
      };

      const collectPrompt = (textarea: HTMLTextAreaElement): string => {
        const candidates = new Set<string>();

        const ariaLabel = textarea.getAttribute("aria-label");
        if (ariaLabel) {
          candidates.add(ariaLabel.trim());
        }

        const labelledBy = textarea.getAttribute("aria-labelledby");
        if (labelledBy) {
          for (const id of labelledBy.split(" ")) {
            const element = document.getElementById(id);
            const text = element?.innerText?.trim();
            if (text) {
              candidates.add(text);
            }
          }
        }

        const label = textarea.closest("label");
        const labelText = label?.innerText?.trim();
        if (labelText) {
          candidates.add(labelText);
        }

        const fieldset = textarea.closest("fieldset");
        const legend = fieldset?.querySelector("legend")?.innerText?.trim();
        if (legend) {
          candidates.add(legend);
        }

        const container = textarea.closest(
          "[role=group], [data-question], .question, .survey-question, .surveyQuestion, .questionContainer",
        );
        const containerText = container?.textContent?.trim();
        if (containerText) {
          candidates.add(containerText.slice(0, 400));
        }

        const previous = textarea.previousElementSibling as HTMLElement | null;
        const previousText = previous?.innerText?.trim();
        if (previousText) {
          candidates.add(previousText);
        }

        return Array.from(candidates)
          .map((value) => value.replace(/\s+/g, " "))
          .filter((value) => value.length > 0)
          .join("\n\n");
      };

      return Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea"))
        .filter((textarea) => !textarea.disabled && textarea.offsetParent !== null)
        .map((textarea, index) => {
          const key = deriveKey(textarea, index);
          const prompt = collectPrompt(textarea);

          return {
            key,
            prompt,
            minLength: textarea.minLength > 0 ? textarea.minLength : undefined,
            maxLength: textarea.maxLength > 0 ? textarea.maxLength : undefined,
            placeholder: textarea.placeholder || undefined,
            rows: textarea.rows || undefined,
          } satisfies LongFormTarget;
        });
    });

    const answers: Record<string, string> = {};

    for (const target of targets) {
      const shouldUseGpt =
        (target.rows ?? 0) > 2 ||
        (target.minLength ?? 0) >= 120 ||
        target.prompt.length >= 40;

      if (!shouldUseGpt) {
        continue;
      }

      const fallback =
        target.placeholder && target.placeholder.trim().length > 0
          ? target.placeholder
          : "This response was generated automatically.";

      const response = await this.longFormResponder.generate({
        prompt: target.prompt || target.placeholder || "Provide a friendly, first-person survey response.",
        minLength: target.minLength,
        maxLength: target.maxLength,
        fallback,
      });

      if (response) {
        answers[target.key] = response;
      }
    }

    return answers;
  }

  private async answerCurrentStep(frame: Frame): Promise<boolean> {
    const serializedAnswers = this.answerBank?.serialize() ?? [];
    const longFormAnswers = await this.buildLongFormAnswers(frame);

    return frame.evaluate(
      ({
        answers,
        longFormAnswers,
      }: {
        answers: SerializedAnswerEntry[];
        longFormAnswers: Record<string, string>;
      }) => {
      const normalize = (text: string | null | undefined): string =>
        (text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

      const numberWords: Record<string, number> = {
        one: 1,
        two: 2,
        three: 3,
        four: 4,
        five: 5,
        six: 6,
        seven: 7,
        eight: 8,
        nine: 9,
        ten: 10,
        first: 1,
        second: 2,
        third: 3,
        fourth: 4,
        fifth: 5,
        sixth: 6,
        seventh: 7,
        eighth: 8,
        ninth: 9,
        tenth: 10,
      };

      const detectAttentionInstruction = (
        text: string | null | undefined,
      ): {
        labelTargets: string[];
        indexTargets: number[];
        typedValue?: string;
        preferredKeywords: string[];
      } | undefined => {
        const raw = (text ?? "").trim();
        if (!raw) {
          return undefined;
        }

        const lower = raw.toLowerCase();
        const hasAttentionLanguage =
          /(attention|quality check|instruction check|bot check|captcha|consistency check|control question|human|verification)/.test(
            lower,
          );
        const hasPoliteInstruction =
          /(please\s+(select|choose|pick|mark|enter|type)|for this question|to show you are|just to check|as a check|for verification)/.test(
            lower,
          );
        const shouldConsiderTargets = hasAttentionLanguage || hasPoliteInstruction;

        const result = {
          labelTargets: [] as string[],
          indexTargets: [] as number[],
          preferredKeywords: [] as string[],
          typedValue: undefined as string | undefined,
        };

        const pushLabel = (value: string) => {
          if (!shouldConsiderTargets) {
            return;
          }
          const normalized = normalize(value);
          if (!normalized) {
            return;
          }

          if (normalized.includes(" and ")) {
            for (const part of normalized.split(" and ")) {
              const trimmed = part.trim();
              if (trimmed && !result.labelTargets.includes(trimmed)) {
                result.labelTargets.push(trimmed);
              }
            }
            return;
          }

          if (!result.labelTargets.includes(normalized)) {
            result.labelTargets.push(normalized);
          }
        };

        const pushIndex = (value: number) => {
          if (!shouldConsiderTargets) {
            return;
          }

          if (!Number.isFinite(value) || value <= 0) {
            return;
          }

          if (!result.indexTargets.includes(value)) {
            result.indexTargets.push(value);
          }
        };

        const typedNumberMatch = lower.match(
          /(?:type|enter|write)\s+(?:the\s+)?(?:number|digit)\s*(\d+)/,
        );
        if (typedNumberMatch?.[1]) {
          result.typedValue = typedNumberMatch[1].trim();
        }

        const typedQuotedMatch = raw.match(
          /(?:type|enter|write)[^"'“”]*["'“”]([^"'“”]{2,})["'“”]/i,
        );
        if (typedQuotedMatch?.[1]) {
          result.typedValue = typedQuotedMatch[1].trim();
        } else if (!result.typedValue) {
          const typedWordMatch = lower.match(
            /(?:type|enter|write)\s+(?:the\s+)?(?:word|phrase|text|answer)\s+([a-z0-9 ]{3,})\s*(?:into|in|below|to confirm|exactly|for verification)?/,
          );
          if (typedWordMatch?.[1] && (hasAttentionLanguage || /exactly|attention|human/.test(lower))) {
            result.typedValue = typedWordMatch[1].trim();
          }
        }

        const quotePattern = /["'“”]([^"'“”]{2,})["'“”]/g;
        if (/(select|choose|pick|mark)/.test(lower)) {
          let quoted: RegExpExecArray | null;
          while ((quoted = quotePattern.exec(raw)) !== null) {
            const phrase = quoted[1]?.trim();
            if (phrase) {
              pushLabel(phrase);
            }
          }
        }

        if (shouldConsiderTargets) {
          const explicitPhrases = [
            "strongly agree",
            "strongly disagree",
            "agree",
            "disagree",
            "neutral",
            "none of the above",
            "all of the above",
            "i am paying attention",
            "i am human",
            "i read the instructions",
            "i read the question",
            "attention",
          ];
          for (const phrase of explicitPhrases) {
            if (lower.includes(phrase)) {
              pushLabel(phrase);
            }
          }

          const colorPhrases = [
            "blue",
            "red",
            "green",
            "yellow",
            "orange",
            "purple",
            "black",
            "white",
            "pink",
            "brown",
          ];
          if (/color/.test(lower) || hasAttentionLanguage) {
            for (const color of colorPhrases) {
              if (lower.includes(color)) {
                pushLabel(color);
              }
            }
          }

          for (const [word, value] of Object.entries(numberWords)) {
            if (
              lower.includes(`${word} option`) ||
              lower.includes(`option ${word}`) ||
              lower.includes(`${word} answer`) ||
              lower.includes(`${word} choice`)
            ) {
              pushIndex(value);
            }
          }

          const numberMatch = lower.match(
            /(?:select|choose|pick|mark|tap)\s+(?:the\s+)?(?:number|option|answer|choice)?\s*(\d+)/,
          );
          if (numberMatch?.[1]) {
            pushIndex(Number.parseInt(numberMatch[1], 10));
          }
        }

        if (hasAttentionLanguage) {
          for (const keyword of [
            "attention",
            "paying attention",
            "i am paying attention",
            "human",
            "quality",
            "instruction",
          ]) {
            const normalized = normalize(keyword);
            if (normalized && !result.preferredKeywords.includes(normalized)) {
              result.preferredKeywords.push(normalized);
            }
          }
        }

        result.labelTargets = Array.from(new Set(result.labelTargets));
        result.indexTargets = Array.from(new Set(result.indexTargets));
        result.preferredKeywords = Array.from(new Set(result.preferredKeywords));

        if (
          !result.labelTargets.length &&
          !result.indexTargets.length &&
          !result.preferredKeywords.length &&
          !result.typedValue
        ) {
          return undefined;
        }

        return result;
      };

      const getLabelText = (input: HTMLElement): string => {
        if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) {
          if (input.labels?.length) {
            return input.labels[0]?.innerText ?? "";
          }

          const ariaLabel = input.getAttribute("aria-label");
          if (ariaLabel) {
            return ariaLabel;
          }

          const describedBy = input.getAttribute("aria-describedby");
          if (describedBy) {
            const describedElement = document.getElementById(describedBy);
            if (describedElement) {
              return describedElement.innerText ?? "";
            }
          }
        }

        const closestLabel = input.closest("label");
        if (closestLabel) {
          return closestLabel.innerText ?? "";
        }

        return input.innerText ?? "";
      };

      const getQuestionText = (element: HTMLElement): string => {
        const labelledBy =
          element instanceof HTMLInputElement || element instanceof HTMLSelectElement
            ? element.labels?.[0]?.innerText
            : undefined;
        if (labelledBy) {
          return labelledBy;
        }

        const ariaLabel = element.getAttribute("aria-label");
        if (ariaLabel) {
          return ariaLabel;
        }

        const fieldset = element.closest("fieldset");
        if (fieldset) {
          const legend = fieldset.querySelector("legend");
          if (legend?.innerText) {
            return legend.innerText;
          }
        }

        const container = element.closest(
          "[role=group], [data-question], .question, .survey-question, .surveyQuestion, .questionContainer",
        );

        if (container) {
          const heading = container.querySelector<HTMLElement>(
            "h1, h2, h3, h4, h5, h6, label, strong, p",
          );
          if (heading?.innerText) {
            return heading.innerText;
          }

          if (container.firstChild instanceof Text) {
            return container.textContent ?? "";
          }
        }

        const previousHeading = element.previousElementSibling as HTMLElement | null;
        if (previousHeading?.innerText) {
          return previousHeading.innerText;
        }

        return element.getAttribute("name") ?? element.getAttribute("id") ?? "";
      };

      const findEntry = (element: HTMLElement): SerializedAnswerEntry | undefined => {
        if (!answers.length) {
          return undefined;
        }

        const questionText = normalize(getQuestionText(element));
        if (!questionText) {
          return undefined;
        }

        return answers.find((entry) => {
          if (entry.question && (questionText.includes(entry.question) || entry.question.includes(questionText))) {
            return true;
          }

          return entry.keywords.some((keyword) => questionText.includes(keyword));
        });
      };

      const chooseRandom = <T,>(items: T[]): T | undefined => {
        if (!items.length) {
          return undefined;
        }

        const index = Math.floor(Math.random() * items.length);
        return items[index];
      };

      let interacted = false;

      const visibleRadios = Array.from(document.querySelectorAll<HTMLInputElement>("input[type=radio]"))
        .filter((input) => !input.disabled && input.offsetParent !== null);

      const radiosByName = new Map<string, HTMLInputElement[]>();
      for (const radio of visibleRadios) {
        const group = radiosByName.get(radio.name) ?? [];
        group.push(radio);
        radiosByName.set(radio.name, group);
      }

      for (const group of Array.from(radiosByName.values())) {
        const questionText = group.length ? getQuestionText(group[0]) : "";
        const attention = questionText ? detectAttentionInstruction(questionText) : undefined;
        const entry = group.length ? findEntry(group[0]) : undefined;
        let option: HTMLInputElement | undefined;

        if (attention?.labelTargets?.length) {
          for (const target of attention.labelTargets) {
            option = group.find((candidate) => {
              const text = normalize(getLabelText(candidate));
              return text.includes(target) || target.includes(text);
            });

            if (option) {
              break;
            }
          }
        }

        if (!option && attention?.preferredKeywords?.length) {
          option = group.find((candidate) => {
            const text = normalize(getLabelText(candidate));
            return attention.preferredKeywords.some((keyword) => keyword && text.includes(keyword));
          });
        }

        if (!option && attention?.indexTargets?.length) {
          for (const indexTarget of attention.indexTargets) {
            const candidate = group[indexTarget - 1];
            if (candidate) {
              option = candidate;
              break;
            }
          }
        }

        if (!option && entry) {
          for (const answer of entry.answers) {
            option = group.find((candidate) => {
              const text = normalize(getLabelText(candidate));
              return text.includes(answer.normalized) || answer.normalized.includes(text);
            });

            if (option) {
              break;
            }
          }
        }

        if (!option) {
          option = chooseRandom<HTMLInputElement>(group);
        }

        if (option) {
          option.click();
          interacted = true;
        }
      }

      const checkboxes = Array.from(document.querySelectorAll<HTMLInputElement>("input[type=checkbox]"))
        .filter((input) => !input.disabled && input.offsetParent !== null);

      if (checkboxes.length) {
        const questionText = getQuestionText(checkboxes[0]);
        const attention = detectAttentionInstruction(questionText);
        const entry = findEntry(checkboxes[0]);
        let matched = false;

        if (attention) {
          const required: HTMLInputElement[] = [];

          if (attention.labelTargets?.length) {
            for (const target of attention.labelTargets) {
              const checkbox = checkboxes.find((candidate) => {
                const text = normalize(getLabelText(candidate));
                return text.includes(target) || target.includes(text);
              });

              if (checkbox && !required.includes(checkbox)) {
                required.push(checkbox);
              }
            }
          }

          if (!required.length && attention.preferredKeywords?.length) {
            const checkbox = checkboxes.find((candidate) => {
              const text = normalize(getLabelText(candidate));
              return attention.preferredKeywords.some((keyword) => keyword && text.includes(keyword));
            });

            if (checkbox) {
              required.push(checkbox);
            }
          }

          if (!required.length && attention.indexTargets?.length) {
            for (const indexTarget of attention.indexTargets) {
              const checkbox = checkboxes[indexTarget - 1];
              if (checkbox && !required.includes(checkbox)) {
                required.push(checkbox);
              }
            }
          }

          for (const checkbox of required) {
            if (!checkbox.checked) {
              checkbox.click();
              interacted = true;
            }
          }

          matched = required.length > 0;
        }

        if (!matched && entry) {
          for (const answer of entry.answers) {
            const checkbox = checkboxes.find((candidate) => {
              const text = normalize(getLabelText(candidate));
              return text.includes(answer.normalized) || answer.normalized.includes(text);
            });

            if (checkbox && !checkbox.checked) {
              checkbox.click();
              interacted = true;
              matched = true;
            }
          }
        }

        if (!matched) {
          const selections = Math.max(1, Math.min(checkboxes.length, 2));
          const shuffled = checkboxes
            .map((value) => ({ value, weight: Math.random() }))
            .sort((a, b) => a.weight - b.weight)
            .slice(0, selections)
            .map((item) => item.value);
          for (const checkbox of shuffled) {
            if (!checkbox.checked) {
              checkbox.click();
              interacted = true;
            }
          }
        }
      }

      const selects = Array.from(document.querySelectorAll<HTMLSelectElement>("select"))
        .filter((select) => !select.disabled && select.offsetParent !== null);

      for (const select of selects) {
        const attention = detectAttentionInstruction(getQuestionText(select));
        const entry = findEntry(select);
        let choice: HTMLOptionElement | undefined;

        if (attention?.labelTargets?.length) {
          for (const target of attention.labelTargets) {
            choice = Array.from(select.options).find((option) => {
              if (!option.value || option.disabled) {
                return false;
              }

              const text = normalize(option.innerText || option.value);
              return text.includes(target) || target.includes(text);
            });

            if (choice) {
              break;
            }
          }
        }

        if (!choice && attention?.preferredKeywords?.length) {
          choice = Array.from(select.options).find((option) => {
            if (!option.value || option.disabled) {
              return false;
            }

            const text = normalize(option.innerText || option.value);
            return attention.preferredKeywords.some((keyword) => keyword && text.includes(keyword));
          });
        }

        if (!choice && attention?.indexTargets?.length) {
          for (const indexTarget of attention.indexTargets) {
            const candidate = select.options[indexTarget - 1];
            if (candidate && candidate.value && !candidate.disabled) {
              choice = candidate;
              break;
            }
          }
        }

        if (entry) {
          for (const answer of entry.answers) {
            choice = Array.from(select.options).find((option) => {
              if (!option.value || option.disabled) {
                return false;
              }

              const text = normalize(option.innerText || option.value);
              return text.includes(answer.normalized) || answer.normalized.includes(text);
            });

            if (choice) {
              break;
            }
          }
        }

        if (!choice) {
          choice = Array.from(select.options).find((option) => option.value && !option.disabled);
        }

        if (choice) {
          select.value = choice.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          interacted = true;
        }
      }

      const textInputs = Array.from(
        document.querySelectorAll<HTMLInputElement>(
          "input[type=text], input[type=number], input[type=tel], input[type=date], input[type=time]",
        ),
      ).filter((input) => !input.disabled && input.offsetParent !== null);

      for (const input of textInputs.slice(0, 2)) {
        const attention = detectAttentionInstruction(getQuestionText(input));
        const entry = findEntry(input);
        const sample =
          (attention?.typedValue ? attention.typedValue : undefined) ||
          entry?.answers[0]?.raw ||
          input.placeholder ||
          input.getAttribute("aria-label") ||
          input.getAttribute("name") ||
          "Sample answer";
        input.focus();
        input.value = sample;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        interacted = true;
      }

      const textareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea"))
        .filter((textarea) => !textarea.disabled && textarea.offsetParent !== null);

      const longForm = longFormAnswers ?? {};

      for (let index = 0; index < textareas.length; index += 1) {
        const textarea = textareas[index];
        const attention = detectAttentionInstruction(getQuestionText(textarea));
        const entry = findEntry(textarea);
        if (!textarea.dataset.answerKey) {
          textarea.dataset.answerKey =
            textarea.name ||
            textarea.id ||
            textarea.getAttribute("data-question-id") ||
            textarea.getAttribute("aria-labelledby") ||
            textarea.getAttribute("aria-label") ||
            textarea.placeholder ||
            `textarea-${index}`;
        }

        const longFormSample = longForm[textarea.dataset.answerKey ?? ""];

        const sample =
          (attention?.typedValue ? attention.typedValue : undefined) ||
          longFormSample ||
          entry?.answers[0]?.raw ||
          textarea.placeholder ||
          textarea.getAttribute("aria-label") ||
          "This response was generated automatically.";
        textarea.focus();
        textarea.value = sample;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
        interacted = true;
      }

      return interacted;
      },
      { answers: serializedAnswers, longFormAnswers },
    );
  }

  private async advance(frame: Frame): Promise<boolean> {
    const selectors = [
      "text:next",
      "text:continue",
      "text:submit",
      "text:finish",
      "css:button[type=submit]",
      "css:input[type=submit]",
      "css:[role=button][data-qa=next]",
    ];

    const clicked = await this.clickFirstMatching(selectors, this.options.idleTimeoutMs, frame);
    if (!clicked) {
      return false;
    }

    await this.humanPause(420, 780);
    return true;
  }

  private async hasCompletedSurvey(frame: Frame): Promise<boolean> {
    return frame.evaluate(() => {
      const completionHints = [
        "thank you",
        "completed",
        "finished",
        "you've earned",
        "no more surveys",
      ];

      const bodyText = document.body.innerText.toLowerCase();
      return completionHints.some((hint) => bodyText.includes(hint));
    });
  }

  private async waitForIdle(page: Page): Promise<void> {
    try {
      await page.waitForNetworkIdle({ idleTime: 750, timeout: this.options.idleTimeoutMs });
    } catch (error) {
      // Ignore timeouts; they merely indicate no network activity was observed.
    }
    await this.humanPause(350, 700);
  }

  private async clickFirstMatching(
    descriptors: string[],
    timeout = 5_000,
    frame?: Frame,
  ): Promise<boolean> {
    const targetFrame = frame ?? this.getActiveSurveyFrame();
    if (!targetFrame) {
      return false;
    }

    for (const descriptor of descriptors) {
      if (descriptor.startsWith("css:")) {
        const selector = descriptor.slice(4);
        try {
          const elementHandle = await targetFrame.waitForSelector(selector, { timeout });
          if (!elementHandle) {
            continue;
          }

          await this.hoverElement(elementHandle, targetFrame);
          await this.clickElement(elementHandle, targetFrame);
          await elementHandle.dispose();
          return true;
        } catch (error) {
          continue;
        }
      }

      if (descriptor.startsWith("text:")) {
        const searchText = descriptor.slice(5).trim().toLowerCase();
        let handle: JSHandle | null = null;
        try {
          handle = await targetFrame.evaluateHandle((text) => {
            const candidates = Array.from(
              document.querySelectorAll<HTMLElement>("button, [role=button], a"),
            ).filter((element) => {
              if (element instanceof HTMLButtonElement && element.disabled) {
                return false;
              }
              return element.innerText.toLowerCase().includes(text) && element.offsetParent !== null;
            });

            return candidates[0] ?? null;
          }, searchText);

          const element = handle.asElement() as ElementHandle<Element> | null;
          if (element) {
            await this.hoverElement(element, targetFrame);
            await this.clickElement(element, targetFrame);
            await element.dispose();
            return true;
          }
        } catch (error) {
          // Ignore and try the next descriptor.
        } finally {
          await handle?.dispose();
        }
      }
    }

    return false;
  }

  private async typeFirstMatching(selectors: string[], value: string): Promise<boolean> {
    const page = this.getPage();
    for (const selector of selectors) {
      try {
        const handle = await page.waitForSelector(selector, { timeout: 2_000 });
        if (!handle) {
          continue;
        }

        await this.hoverElement(handle, page);
        await handle.click({ clickCount: 3, delay: Math.round(this.randomBetween(60, 150)) });
        await this.humanPause(140, 320);
        await handle.type(value, { delay: Math.round(this.randomBetween(45, 130)) });
        await this.humanPause(160, 320);
        return true;
      } catch (error) {
        continue;
      }
    }

    return false;
  }

  private pickRandom<T>(values: readonly T[]): T {
    if (!values.length) {
      throw new Error("Unable to select a random value from an empty list.");
    }

    const index = Math.floor(Math.random() * values.length);
    return values[Math.max(0, Math.min(values.length - 1, index))];
  }

  private randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private async humanPause(min = 120, max = 280): Promise<void> {
    const duration = Math.round(this.randomBetween(min, max));
    await delay(duration);
  }

  private async jitterMouse(page: Page, moves = 2): Promise<void> {
    const viewport = page.viewport();
    if (!viewport) {
      return;
    }

    for (let index = 0; index < moves; index += 1) {
      const x = this.randomBetween(viewport.width * 0.15, viewport.width * 0.85);
      const y = this.randomBetween(viewport.height * 0.15, viewport.height * 0.85);
      await this.moveMouseNaturally(page, x, y);
    }
  }

  private async seedMousePosition(page: Page): Promise<void> {
    const viewport = page.viewport();
    if (!viewport) {
      return;
    }

    const startX = this.randomBetween(viewport.width * 0.25, viewport.width * 0.75);
    const startY = this.randomBetween(viewport.height * 0.25, viewport.height * 0.75);
    await page.mouse.move(startX, startY, { steps: 2 + Math.floor(Math.random() * 3) });
    this.mousePosition = { x: startX, y: startY };
    await this.humanPause(80, 160);
    await this.jitterMouse(page, 1 + Math.floor(Math.random() * 2));
  }

  private async moveMouseNaturally(
    page: Page,
    targetX: number,
    targetY: number,
    options?: { overshoot?: boolean },
  ): Promise<void> {
    const viewport = page.viewport();
    if (!viewport) {
      await page.mouse.move(targetX, targetY);
      this.mousePosition = { x: targetX, y: targetY };
      return;
    }

    let start = this.mousePosition;
    if (!start) {
      const seedX = this.randomBetween(viewport.width * 0.25, viewport.width * 0.75);
      const seedY = this.randomBetween(viewport.height * 0.25, viewport.height * 0.75);
      await page.mouse.move(seedX, seedY, { steps: 2 + Math.floor(Math.random() * 3) });
      start = { x: seedX, y: seedY };
      this.mousePosition = start;
      await this.humanPause(60, 140);
    }

    const clampX = (value: number): number => this.clamp(value, 1, viewport.width - 1);
    const clampY = (value: number): number => this.clamp(value, 1, viewport.height - 1);

    const followPath = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const segments = Math.max(1, Math.round(this.randomBetween(2, 4)));
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const maxOffset = Math.min(45, distance * 0.3);

      for (let index = 1; index <= segments; index += 1) {
        const progress = index / (segments + 1);
        const offsetStrength = (Math.random() - 0.5) * 2 * maxOffset * (1 - progress);
        const intermediateX = clampX(from.x + (to.x - from.x) * progress + offsetStrength);
        const intermediateY = clampY(from.y + (to.y - from.y) * progress + offsetStrength * 0.6);
        await page.mouse.move(intermediateX, intermediateY, {
          steps: Math.max(3, Math.round(this.randomBetween(4, 8))),
        });
        await this.humanPause(25, 60);
      }

      await page.mouse.move(clampX(to.x), clampY(to.y), {
        steps: Math.max(4, Math.round(this.randomBetween(6, 14))),
      });
      await this.humanPause(30, 70);
    };

    let origin = start;

    if (options?.overshoot) {
      const overshootX = clampX(targetX + this.randomBetween(-18, 18));
      const overshootY = clampY(targetY + this.randomBetween(-18, 18));
      await followPath(origin, { x: overshootX, y: overshootY });
      origin = { x: overshootX, y: overshootY };
    }

    await followPath(origin, { x: targetX, y: targetY });
    this.mousePosition = { x: clampX(targetX), y: clampY(targetY) };
  }

  private async hoverElement(
    element: ElementHandle<Element>,
    frameOrPage: Frame | Page,
  ): Promise<void> {
    const resolvedPage = this.resolvePage(frameOrPage);
    const box = await element.boundingBox();
    if (!box) {
      return;
    }

    const targetX = this.randomBetween(box.x + box.width * 0.2, box.x + box.width * 0.8);
    const targetY = this.randomBetween(box.y + box.height * 0.2, box.y + box.height * 0.8);
    await this.moveMouseNaturally(resolvedPage, targetX, targetY, { overshoot: Math.random() < 0.5 });
    await this.humanPause(90, 200);
  }

  private async clickElement(element: ElementHandle<Element>, frame: Frame | Page): Promise<void> {
    const resolvedPage = this.resolvePage(frame);
    const box = await element.boundingBox();

    if (box) {
      const targetX = this.randomBetween(box.x + box.width * 0.25, box.x + box.width * 0.75);
      const targetY = this.randomBetween(box.y + box.height * 0.25, box.y + box.height * 0.75);
      await this.moveMouseNaturally(resolvedPage, targetX, targetY, { overshoot: true });
      await this.humanPause(70, 160);
      await resolvedPage.mouse.down();
      await this.humanPause(40, 120);
      await resolvedPage.mouse.up();
    } else {
      await element.click({ delay: Math.round(this.randomBetween(70, 150)) });
    }

    await this.humanPause(120, 260);
  }

  private clamp(value: number, min: number, max: number): number {
    if (Number.isNaN(value)) {
      return min;
    }

    if (value < min) {
      return min;
    }

    if (value > max) {
      return max;
    }

    return value;
  }

  private resolvePage(frameOrPage: Frame | Page): Page {
    if (typeof (frameOrPage as Page).mouse !== "undefined") {
      return frameOrPage as Page;
    }

    const frame = frameOrPage as Frame;
    const page = typeof frame.page === "function" ? frame.page() : undefined;
    return page ?? this.getPage();
  }
}

function parseCliArgs(argv: string[]): Partial<SurveyJunkieBotOptions> {
  const args = argv.slice(2);
  const options: Partial<SurveyJunkieBotOptions> = {};

  for (const arg of args) {
    const [key, rawValue] = arg.split("=");
    if (!rawValue) {
      continue;
    }

    const value = rawValue.trim();

    switch (key) {
      case "--email":
        options.email = value;
        break;
      case "--password":
        options.password = value;
        break;
      case "--survey":
        options.surveyUrl = value;
        break;
      case "--headless":
        options.headless = value !== "false";
        break;
      case "--max-steps":
        options.maxSteps = Number.parseInt(value, 10);
        break;
      case "--idle-timeout":
        options.idleTimeoutMs = Number.parseInt(value, 10);
        break;
      case "--answers":
        options.answerWorkbookPath = value;
        break;
      case "--gpt-long-form":
        options.useGptLongForm = value !== "false";
        break;
      case "--openai-api-key":
        options.openAIApiKey = value;
        break;
      case "--gpt-model":
        options.gptModel = value;
        break;
      case "--gpt-prompt":
        options.gptPrompt = value;
        break;
      default:
        break;
    }
  }

  return options;
}

export async function runSurveyJunkieBotCli(): Promise<void> {
  const cliOptions = parseCliArgs(process.argv);
  const email = cliOptions.email ?? process.env.SURVEYJUNKIE_EMAIL;
  const password = cliOptions.password ?? process.env.SURVEYJUNKIE_PASSWORD;
  const surveyUrl = cliOptions.surveyUrl ?? process.env.SURVEYJUNKIE_SURVEY_URL;
  const headless =
    typeof cliOptions.headless === "boolean"
      ? cliOptions.headless
      : process.env.SURVEYJUNKIE_HEADLESS !== undefined
      ? !/^(false|0)$/i.test(process.env.SURVEYJUNKIE_HEADLESS)
      : undefined;
  const idleTimeoutMs =
    cliOptions.idleTimeoutMs ??
    (process.env.SURVEYJUNKIE_IDLE_TIMEOUT_MS
      ? Number.parseInt(process.env.SURVEYJUNKIE_IDLE_TIMEOUT_MS, 10)
      : undefined);
  const maxSteps =
    cliOptions.maxSteps ??
    (process.env.SURVEYJUNKIE_MAX_STEPS
      ? Number.parseInt(process.env.SURVEYJUNKIE_MAX_STEPS, 10)
      : undefined);
  const answerWorkbookPath =
    cliOptions.answerWorkbookPath ?? process.env.SURVEYJUNKIE_ANSWER_WORKBOOK;
  const useGptLongForm =
    typeof cliOptions.useGptLongForm === "boolean"
      ? cliOptions.useGptLongForm
      : process.env.SURVEYJUNKIE_USE_GPT_LONG_FORM === "true";
  const openAIApiKey = cliOptions.openAIApiKey ?? process.env.OPENAI_API_KEY;
  const gptModel =
    cliOptions.gptModel ??
    process.env.OPENAI_MODEL ??
    process.env.SURVEYJUNKIE_GPT_MODEL ??
    undefined;
  const gptPrompt = cliOptions.gptPrompt ?? process.env.SURVEYJUNKIE_GPT_PROMPT;

  if (!email || !password) {
    console.error(
      "Survey Junkie credentials are required. Pass them via --email/--password or SURVEYJUNKIE_EMAIL/SURVEYJUNKIE_PASSWORD.",
    );
    process.exitCode = 1;
    return;
  }

  const bot = new SurveyJunkieBot({
    email,
    password,
    surveyUrl,
    headless,
    idleTimeoutMs,
    maxSteps,
    answerWorkbookPath,
    useGptLongForm,
    openAIApiKey,
    gptModel,
    gptPrompt,
  });

  await bot.run();
}
