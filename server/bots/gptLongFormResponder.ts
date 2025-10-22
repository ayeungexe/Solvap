import OpenAI from "openai";

export type GptLongFormResponderOptions = {
  apiKey: string;
  model?: string;
  basePrompt?: string;
};

export type GptLongFormRequest = {
  prompt: string;
  minLength?: number;
  maxLength?: number;
  fallback?: string;
};

const DEFAULT_BASE_PROMPT =
  "You are helping complete market research surveys. Provide sincere, first-person answers that sound natural and specific.";

export class GptLongFormResponder {
  private readonly client: any;
  private readonly model: string;
  private readonly basePrompt: string;

  constructor(options: GptLongFormResponderOptions) {
    if (!options.apiKey) {
      throw new Error("An OpenAI API key is required to enable GPT long-form responses.");
    }

    this.client = new OpenAI({ apiKey: options.apiKey });
    this.model = options.model ?? "gpt-4.1-mini";
    this.basePrompt = options.basePrompt?.trim().length
      ? options.basePrompt
      : DEFAULT_BASE_PROMPT;
  }

  async generate(request: GptLongFormRequest): Promise<string | undefined> {
    const trimmedPrompt = request.prompt?.trim();
    if (!trimmedPrompt) {
      return request.fallback;
    }

    try {
      const requirements: string[] = [
        "Respond as a human participant describing personal experiences.",
        "Keep the answer within 3-5 sentences unless the question requests otherwise.",
      ];

      if (request.minLength && request.minLength > 0) {
        requirements.push(`Ensure the response is at least ${request.minLength} characters.`);
      }

      if (request.maxLength && request.maxLength > 0) {
        requirements.push(`Keep the response under ${request.maxLength} characters.`);
      }

      const response = await this.client.responses.create({
        model: this.model,
        input: [
          {
            role: "system",
            content: `${this.basePrompt}\n\n${requirements.join("\n")}`,
          },
          {
            role: "user",
            content: `Survey prompt: ${trimmedPrompt}\n\nWrite a thoughtful answer in the first person.`,
          },
        ],
        max_output_tokens: request.maxLength && request.maxLength > 0 ? Math.max(120, request.maxLength) : 240,
      });

      const text = response.output_text?.trim();
      if (text) {
        return text;
      }
    } catch (error) {
      console.warn("Failed to retrieve GPT long-form response:", error);
    }

    return request.fallback;
  }
}
