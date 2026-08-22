import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Makes getCloudflareContext() (D1/R2/Queues bindings) available during `next dev`.
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {};

export default nextConfig;
