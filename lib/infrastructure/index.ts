import type { Repositories } from "@/lib/repositories";
import { createMockRepositories } from "./mock/repositories";

let cached: Repositories | null = null;

/**
 * Composition root: the only place that decides which adapter backs the
 * repository interfaces. Pages and services never know the storage technology.
 *
 * MOMENT_OS_DATA_SOURCE=d1 switches to the Cloudflare D1 adapter (requires a
 * provisioned database + applied migrations); anything else uses mock data.
 */
export async function getRepositories(): Promise<Repositories> {
  if (cached) return cached;

  if (process.env.MOMENT_OS_DATA_SOURCE === "d1") {
    const { createD1Repositories } = await import("./cloudflare/d1/repositories");
    cached = await createD1Repositories();
    return cached;
  }
  cached = createMockRepositories();
  return cached;
}
