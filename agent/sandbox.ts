import { defineSandbox } from "eve/sandbox";
import { DockerSandbox } from "eve/sandbox/docker";
import { JustBashSandbox } from "eve/sandbox/just-bash";
import { VercelSandbox } from "eve/sandbox/vercel";

/**
 * Where `bash`, `read_file`, and `write_file` run. Chosen at build time with
 * AGENT_SANDBOX so the build machine does not silently pick a provider:
 *
 * - "just-bash" (default): pure-JavaScript shell and virtual filesystem. Runs
 *   anywhere with no dependencies, but has no native processes (no python,
 *   no real curl) and no isolation beyond the JS runtime.
 * - "docker": one persistent container per session. Real Linux tools and
 *   isolation. Needs a running Docker daemon at build and run time.
 * - "vercel": hosted Vercel Sandbox microVMs. Use when deployed to Vercel.
 */
function selectEnvironment() {
  switch (process.env.AGENT_SANDBOX) {
    case "docker":
      return DockerSandbox.environment();
    case "vercel":
      return VercelSandbox.environment();
    default:
      return JustBashSandbox.environment({ autoInstall: false });
  }
}

export const environment = selectEnvironment();

export default defineSandbox(() => environment.open());
