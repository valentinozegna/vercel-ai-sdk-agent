import { defineTool } from "eve/tools";
import { z } from "zod";

import { logActivity } from "../lib/activity";
import { deleteRoutine } from "../lib/routines";

export default defineTool({
  description:
    "Permanently delete one of your routines. To stop it temporarily, use update_routine with enabled: false instead.",
  inputSchema: z.object({ id: z.string().uuid() }),
  label: { start: () => "Delete routine" },
  async execute({ id }) {
    const deleted = await deleteRoutine(id);
    if (deleted) {
      await logActivity({ kind: "routine-change", status: "ok", summary: `Deleted routine ${id}` });
    }
    return { deleted };
  },
});
