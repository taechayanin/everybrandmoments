"use client";

import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { Avatar, Card, MomentChip } from "@/components/ui";
import { baht, bahtFull, monthYear, shortDate } from "@/lib/format";
import type { WorkspaceView } from "@/lib/application/workspace/get-workspace-view";

export function AccountPanel({ view }: { view: WorkspaceView }) {
  const router = useRouter();
  const { account } = view;

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <p className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          <Building2 size={12} /> Customer
        </p>
        <select
          value={account.id}
          onChange={(e) => router.push(`/workspace?account=${e.target.value}`)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-300"
        >
          {view.accountOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <div className="mt-3 flex items-center gap-2.5 px-1">
          <Avatar name={account.name} id={account.id} size={10} />
          <div>
            <p className="text-sm font-bold text-slate-900">{account.name}</p>
            <p className="text-[11px] text-slate-500">{account.industry}</p>
          </div>
        </div>
        <div className="mt-3 space-y-1.5 rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">
          <p>ขนาด: {account.employeeSize} คน · {account.branchCount} สาขา</p>
          <p>Tier: {account.tier}</p>
          <p>
            ความสัมพันธ์:{" "}
            {account.customerSince
              ? `ลูกค้าตั้งแต่ ${monthYear(account.customerSince)}`
              : "New Prospect"}
          </p>
          <p>LTV: {account.ltv ? baht(account.ltv) : "—"}</p>
        </div>
      </Card>

      <Card className="p-3">
        <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Purchase History
        </p>
        {account.purchases.length === 0 ? (
          <p className="px-1 text-[11px] text-slate-400">ยังไม่เคยซื้อ</p>
        ) : (
          <div className="space-y-2">
            {[...account.purchases].reverse().slice(0, 4).map((p, i) => (
              <div key={i} className="rounded-lg bg-slate-50 px-2.5 py-2">
                <p className="text-[11px] font-semibold text-slate-700">{p.item}</p>
                <p className="text-[10px] text-slate-400">
                  {shortDate(p.date)} · {bahtFull(p.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-3">
        <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Previous Moments
        </p>
        <div className="space-y-1.5 px-1">
          {view.previousMoments.slice(-4).map((e) => (
            <div key={e.id} className="flex items-center justify-between text-[11px]">
              <MomentChip code={e.momentType} small />
              <span className="text-slate-400">{monthYear(e.detectedAt)}</span>
            </div>
          ))}
          {view.previousMoments.length === 0 && (
            <p className="text-[11px] text-slate-400">ยังไม่มีประวัติ</p>
          )}
        </div>
      </Card>
    </div>
  );
}
