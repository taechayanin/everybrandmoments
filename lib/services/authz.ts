// Pre-Sprint-7 write gating (review 🔴 §2).
//
// Until real authentication lands, every server-side write runs as the demo
// persona — which corrupts the audit trail if anonymous visitors can reach it.
// Deployment contract:
//   - Internal pilot: the whole app sits behind Cloudflare Access and
//     MOMENT_OS_WRITES stays "enabled".
//   - Public demo:   set MOMENT_OS_WRITES=disabled — every write action
//     refuses instead of recording a fake authenticated actor.
// Sprint 7 replaces this with per-user auth + RBAC.

import type { UserId } from "@/lib/types";

export const DEMO_USER: UserId = "USR-010";

export function writesEnabled(): boolean {
  return process.env.MOMENT_OS_WRITES !== "disabled";
}

export const WRITES_DISABLED_MESSAGE =
  "ระบบปิดการแก้ไขข้อมูลชั่วคราว (โหมดสาธิตสาธารณะ — รอระบบล็อกอินใน Sprint 7)";
