import { eveChannel } from "eve/channels/eve";
import { type AuthFn, httpBasic, localDev } from "eve/channels/auth";

/**
 * The HTTP session API (TUI, curl, web clients). Self-hosted, it is protected
 * with HTTP Basic auth from EVE_ADMIN_USER / EVE_ADMIN_PASSWORD. Without a
 * password, only `eve dev` on localhost can reach it.
 */
function ownerBasicAuth(): AuthFn<Request>[] {
  const password = process.env.EVE_ADMIN_PASSWORD;
  if (!password) return [];
  return [
    httpBasic(
      { username: process.env.EVE_ADMIN_USER || "owner", password },
      { realm: "agent" },
    ),
  ];
}

export default eveChannel({
  auth: [...ownerBasicAuth(), localDev()],
});
