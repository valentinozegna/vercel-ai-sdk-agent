import { defineTool } from "eve/tools";
import { z } from "zod";

import { ownerTimeZone } from "../lib/config";

export default defineTool({
  description:
    "Get the current date and time, by default in the owner's time zone. Pass an IANA time zone to convert, e.g. to answer 'what time is it in Tokyo?'.",
  inputSchema: z.object({
    timeZone: z.string().optional().describe('IANA time zone, e.g. "Asia/Tokyo"'),
  }),
  execute({ timeZone }) {
    const zone = timeZone || ownerTimeZone();
    const now = new Date();
    return {
      iso: now.toISOString(),
      local: new Intl.DateTimeFormat("en-GB", {
        dateStyle: "full",
        timeStyle: "long",
        timeZone: zone,
      }).format(now),
      timeZone: zone,
    };
  },
});
