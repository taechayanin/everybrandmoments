import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Cloudflare bindings (D1 / R2 / Queues) for the current request. */
export async function getBindings(): Promise<CloudflareEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env as CloudflareEnv;
}
