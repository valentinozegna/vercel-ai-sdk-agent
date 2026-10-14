import { defineAgent, defineDynamic } from "eve";

import { modelSelection } from "../../lib/models";

export default defineAgent({
  description:
    "Researches a question in depth on the web (several searches, reading primary sources) and returns a concise, cited brief. Use for anything that needs more than one quick search: comparisons, purchases, travel, news, technical questions.",
  // RESEARCHER_MODEL, or the main provider's lighter default.
  model: defineDynamic({
    events: {
      "step.started": () => modelSelection(process.env.RESEARCHER_MODEL, "light"),
    },
  }),
});
