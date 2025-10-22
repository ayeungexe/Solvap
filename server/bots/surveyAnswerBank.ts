import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { read, utils } from "xlsx";

export type SerializedAnswerEntry = {
  rawQuestion: string;
  question: string;
  keywords: string[];
  answers: { raw: string; normalized: string }[];
  type?: string;
};

export class SurveyAnswerBank {
  private readonly entries: SerializedAnswerEntry[];

  private constructor(entries: SerializedAnswerEntry[]) {
    this.entries = entries;
  }

  static async fromWorkbook(filePath: string): Promise<SurveyAnswerBank> {
    const absolutePath = resolve(filePath);
    const buffer = await readFile(absolutePath);
    const workbook = read(buffer, { type: "buffer" });

    if (!workbook.SheetNames.length) {
      throw new Error(`No worksheets found in ${filePath}.`);
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = utils.sheet_to_json(sheet, {
      defval: "",
      raw: false,
    }) as Record<string, string | number>[];

    const entries: SerializedAnswerEntry[] = [];

    for (const row of rows) {
      const normalizedRow = Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key.toLowerCase(), String(value ?? "").trim()]),
      );

      const question = normalizedRow.question ?? "";
      const answersCell = normalizedRow.answers ?? normalizedRow.answer ?? "";
      const keywordsCell = normalizedRow.keywords ?? "";
      const type = normalizedRow.type || undefined;

      if (!question && !keywordsCell) {
        continue;
      }

      const answers = answersCell
        .split("|")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

      if (!answers.length) {
        continue;
      }

      const normalize = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

      entries.push({
        rawQuestion: question,
        question: normalize(question),
        keywords: keywordsCell
          .split(",")
          .map((value) => normalize(value))
          .filter((value) => value.length > 0),
        answers: answers.map((answer) => ({ raw: answer, normalized: normalize(answer) })),
        type,
      });
    }

    return new SurveyAnswerBank(entries);
  }

  get size(): number {
    return this.entries.length;
  }

  serialize(): SerializedAnswerEntry[] {
    return this.entries;
  }
}
