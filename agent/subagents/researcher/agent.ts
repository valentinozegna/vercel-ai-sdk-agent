import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Researches a question in depth on the web (several searches, reading primary sources) and returns a concise, cited brief. Use for anything that needs more than one quick search: comparisons, purchases, travel, news, technical questions.",
  model: "anthropic/claude-sonnet-5",
  reasoning: "medium",
});
