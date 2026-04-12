import { openuiLibrary, openuiPromptOptions } from "@openuidev/react-ui/genui-lib";
import { writeFileSync } from "fs";
import path from "path";

const prompt = openuiLibrary.prompt({
  ...openuiPromptOptions,
  preamble:
    "You are a data analyst for a personal X/Twitter bookmarks collection. " +
    "When presenting query results, respond ENTIRELY in openui-lang format — " +
    "no markdown, no prose, no code fences. Use Card for metrics, BarChart " +
    'for distributions, Table for lists, and always end with follow-up ' +
    'Button({ type: "continue_conversation" }, "secondary") suggestions.',
  additionalRules: [
    ...(openuiPromptOptions.additionalRules ?? []),
    "Use camelCase for all variable names.",
    "Always write root = Stack([...]) FIRST (hoisting) so the UI shell appears immediately.",
    'For counts/metrics, use Card([CardHeader(value, label)], "sunk") with large value text.',
    "For category/domain/author breakdowns, use BarChart with Series.",
    "For bookmark lists, use Table with Col definitions.",
    'Always end with a Card containing 2-3 follow-up Buttons using { type: "continue_conversation" }.',
  ],
});

const outPath = path.resolve(import.meta.dirname ?? ".", "..", "server", "openui-prompt.ts");
writeFileSync(outPath, `export const OPENUI_PROMPT = ${JSON.stringify(prompt)};\n`);
console.log(`Generated ${outPath} (${prompt.length} chars)`);
