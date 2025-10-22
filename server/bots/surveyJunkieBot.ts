import puppeteer, { Browser, ElementHandle, Frame, HTTPRequest, JSHandle, Page } from "puppeteer";
import { setTimeout as delay } from "node:timers/promises";

export type SurveyJunkieBotOptions = {
  email: string;
  password: string;
  surveyUrl?: string;
  headless?: boolean;
  idleTimeoutMs?: number;
  maxSteps?: number;
};

export class SurveyJunkieBot {
  private browser?: Browser;
  private page?: Page;
  private readonly options: Required<Omit<SurveyJunkieBotOptions, "headless" | "surveyUrl">> & {
    headless: boolean;
    surveyUrl?: string;
  };

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
    };
  }

  async run(): Promise<void> {
    await this.launch();

    try {
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

    this.browser = await puppeteer.launch({
      headless: this.options.headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-features=site-per-process",
      ],
      defaultViewport: { width: 1280, height: 768 },
    });

    this.page = await this.browser.newPage();

    await this.page.setRequestInterception(true);
    this.page.on("request", (request: HTTPRequest) => {
      if (["image", "font", "media"].includes(request.resourceType())) {
        request.abort().catch(() => undefined);
        return;
      }

      request.continue().catch(() => undefined);
    });
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

  private async answerCurrentStep(frame: Frame): Promise<boolean> {
    return frame.evaluate(() => {
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
        const option = chooseRandom<HTMLInputElement>(group);
        if (option) {
          option.click();
          interacted = true;
        }
      }

      const checkboxes = Array.from(document.querySelectorAll<HTMLInputElement>("input[type=checkbox]"))
        .filter((input) => !input.disabled && input.offsetParent !== null);

      if (checkboxes.length) {
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

      const selects = Array.from(document.querySelectorAll<HTMLSelectElement>("select"))
        .filter((select) => !select.disabled && select.offsetParent !== null);

      for (const select of selects) {
        const choice = Array.from(select.options).find((option) => option.value && !option.disabled);
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
        const sample =
          input.placeholder || input.getAttribute("aria-label") || input.getAttribute("name") || "Sample answer";
        input.focus();
        input.value = sample;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        interacted = true;
      }

      const textareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea"))
        .filter((textarea) => !textarea.disabled && textarea.offsetParent !== null);

      for (const textarea of textareas) {
        const sample =
          textarea.placeholder || textarea.getAttribute("aria-label") || "This response was generated automatically.";
        textarea.focus();
        textarea.value = sample;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
        interacted = true;
      }

      return interacted;
    });
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

    await delay(750);
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

          await elementHandle.click();
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
            await element.click();
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

        await handle.click({ clickCount: 3 });
        await handle.type(value, { delay: 50 });
        return true;
      } catch (error) {
        continue;
      }
    }

    return false;
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
      default:
        break;
    }
  }

  return options;
}

async function main(): Promise<void> {
  const cliOptions = parseCliArgs(process.argv);
  const email = cliOptions.email ?? process.env.SURVEYJUNKIE_EMAIL;
  const password = cliOptions.password ?? process.env.SURVEYJUNKIE_PASSWORD;

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
    surveyUrl: cliOptions.surveyUrl,
    headless: cliOptions.headless,
    idleTimeoutMs: cliOptions.idleTimeoutMs,
    maxSteps: cliOptions.maxSteps,
  });

  await bot.run();
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Survey Junkie automation failed:", error);
    process.exitCode = 1;
  });
}
