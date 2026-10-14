import { defineDynamic, defineInstructions } from "eve/instructions";

import { formatOwnerTime, ownerName, ownerTimeZone } from "../lib/config";

/**
 * Gives every turn the owner's current local time. It is appended as a short
 * user-role message so the cached system prompt stays stable.
 */
export default defineDynamic({
  events: {
    "turn.started": () => {
      const name = ownerName();
      const lines = [
        `<now>${formatOwnerTime()} (${ownerTimeZone()})</now>`,
        ...(name ? [`<owner>${name}</owner>`] : []),
      ];
      return defineInstructions({ content: lines.join("\n"), role: "user" });
    },
  },
});
