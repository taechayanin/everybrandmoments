import Link from "next/link";
import { Radar as RadarIcon } from "lucide-react";
import {
  Avatar,
  Card,
  MomentChip,
  PageHeader,
  PriorityBadge,
  StatusBadge,
} from "@/components/ui";
import { getMomentRadar } from "@/lib/application/moments/get-moment-radar";
import { getJourneyView } from "@/lib/application/moments/get-journey";
import { MOMENT_CODES } from "@/lib/domain/moment";
import { totalScore } from "@/lib/domain/score";
import { shortDate, walletRange } from "@/lib/format";
import type { Priority, TriggerSource } from "@/lib/types";
import { AddMomentButton } from "./add-moment-modal";

export const dynamic = "force-dynamic";

const SOURCE_GROUPS: { key: string; label: string; sources: TriggerSource[] }[] = [
  { key: "all", label: "ทั้งหมด", sources: [] },
  { key: "internal", label: "Internal", sources: ["CRM Note", "Lead Form", "Meeting Note", "Order History", "Complaint"] },
  { key: "external", label: "External", sources: ["Social Signal", "Job Posting", "Website", "News"] },
  { key: "rule", label: "Rule Engine", sources: ["Rule Engine"] },
  { key: "manual", label: "Manual", sources: ["Manual"] },
];

const PRIORITIES: (Priority | "ALL")[] = ["ALL", "HOT", "WARM", "NURTURE", "WATCH"];

// Filters live in the URL and are applied by the repository (server-side),
// not by filtering a full dataset in the browser (refactor plan §34).
export default async function MomentRadar({
  searchParams,
}: PageProps<"/radar">) {
  const sp = await searchParams;
  const sourceKey = typeof sp.source === "string" ? sp.source : "all";
  const prioParam = typeof sp.priority === "string" ? (sp.priority as Priority) : undefined;
  const prio = prioParam && PRIORITIES.includes(prioParam) ? prioParam : undefined;

  const group = SOURCE_GROUPS.find((g) => g.key === sourceKey) ?? SOURCE_GROUPS[0];
  const [view, journey] = await Promise.all([
    getMomentRadar({
      priority: prio,
      triggerSources: group.sources.length > 0 ? group.sources : undefined,
      limit: 50,
    }),
    getJourneyView(),
  ]);

  const filterHref = (source: string, priority?: string) => {
    const q = new URLSearchParams();
    if (source !== "all") q.set("source", source);
    if (priority && priority !== "ALL") q.set("priority", priority);
    const s = q.toString();
    return s ? `/radar?${s}` : "/radar";
  };

  return (
    <div>
      <PageHeader
        title="Moment Radar"
        subtitle="Detect Business Signals → Convert เป็น Moment Opportunities"
      >
        <AddMomentButton
          accountOptions={journey.accountOptions}
          momentCodes={[...MOMENT_CODES]}
        />
      </PageHeader>

      {/* Filters — server-applied via URL params */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Signal Source
        </span>
        {SOURCE_GROUPS.map((g) => (
          <Link
            key={g.key}
            href={filterHref(g.key, prio)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              sourceKey === g.key
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {g.label}
          </Link>
        ))}
        <span className="ml-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Priority
        </span>
        {PRIORITIES.map((p) => (
          <Link
            key={p}
            href={filterHref(sourceKey, p)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              (prio ?? "ALL") === p
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {p === "ALL" ? "ทั้งหมด" : p}
          </Link>
        ))}
      </div>

      {/* Radar table */}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-semibold">Score</th>
              <th className="px-4 py-3 font-semibold">Account</th>
              <th className="px-4 py-3 font-semibold">Moment</th>
              <th className="px-4 py-3 font-semibold">Trigger</th>
              <th className="px-4 py-3 font-semibold">คาดว่าเกิด</th>
              <th className="px-4 py-3 font-semibold">Potential Wallet</th>
              <th className="px-4 py-3 font-semibold">Owner</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {view.rows.map(({ event: e, account: acc, ownerName }) => (
              <tr key={e.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <PriorityBadge score={totalScore(e.score)} />
                </td>
                <td className="px-4 py-3">
                  <Link href={`/accounts/${acc.id}`} className="flex items-center gap-2 font-medium text-slate-800 hover:text-indigo-600">
                    <Avatar name={acc.name} id={acc.id} size={7} />
                    <span>
                      {acc.name}
                      <span className="block text-[11px] font-normal text-slate-400">{acc.industry}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/radar/${e.id}`} className="group block">
                    <MomentChip code={e.momentType} small />
                    <span className="mt-1 block text-[11px] text-slate-500 group-hover:text-indigo-600 group-hover:underline">
                      {e.subMoment}
                    </span>
                  </Link>
                </td>
                <td className="max-w-[220px] px-4 py-3">
                  <span className="text-[11px] font-semibold text-slate-600">{e.triggerSource}</span>
                  <span className="block truncate text-[11px] text-slate-400">{e.triggerDetail}</span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">{shortDate(e.expectedEventDate)}</td>
                <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                  {walletRange(e.potentialWalletMin, e.potentialWalletMax)}
                </td>
                <td className="px-4 py-3 text-[11px] text-slate-500">{ownerName}</td>
                <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {view.rows.length === 0 && (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-400">
            <RadarIcon size={16} /> ไม่พบ Moment ตามเงื่อนไข
          </div>
        )}
      </Card>
    </div>
  );
}
