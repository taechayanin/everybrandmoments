"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Radar as RadarIcon, X } from "lucide-react";
import {
  Avatar,
  Card,
  MomentChip,
  PageHeader,
  PriorityBadge,
  StatusBadge,
} from "@/components/ui";
import { ACCOUNTS, accountById } from "@/lib/data/accounts";
import { MOMENT_EVENTS } from "@/lib/data/events";
import { MASTER_MOMENTS } from "@/lib/data/moments";
import { userName } from "@/lib/data/users";
import {
  priorityOf,
  shortDate,
  totalScore,
  walletRange,
} from "@/lib/format";
import type { Priority, TriggerSource } from "@/lib/types";

const SOURCE_GROUPS: { label: string; sources: TriggerSource[] }[] = [
  { label: "ทั้งหมด", sources: [] },
  { label: "Internal", sources: ["CRM Note", "Lead Form", "Meeting Note", "Order History", "Complaint"] },
  { label: "External", sources: ["Social Signal", "Job Posting", "Website", "News"] },
  { label: "Rule Engine", sources: ["Rule Engine"] },
  { label: "Manual", sources: ["Manual"] },
];

const PRIORITIES: (Priority | "ALL")[] = ["ALL", "HOT", "WARM", "NURTURE", "WATCH"];

export default function MomentRadar() {
  const [sourceGroup, setSourceGroup] = useState("ทั้งหมด");
  const [prio, setPrio] = useState<Priority | "ALL">("ALL");
  const [showAdd, setShowAdd] = useState(false);
  const [added, setAdded] = useState<
    { account: string; moment: string; trigger: string; date: string }[]
  >([]);

  const events = useMemo(() => {
    const group = SOURCE_GROUPS.find((g) => g.label === sourceGroup);
    return [...MOMENT_EVENTS]
      .filter((e) => !["Won", "Lost", "Delivery", "Next Moment"].includes(e.status))
      .filter((e) => !group || group.sources.length === 0 || group.sources.includes(e.triggerSource))
      .filter((e) => prio === "ALL" || priorityOf(totalScore(e.score)) === prio)
      .sort((a, b) => totalScore(b.score) - totalScore(a.score));
  }, [sourceGroup, prio]);

  return (
    <div>
      <PageHeader
        title="Moment Radar"
        subtitle="Detect Business Signals → Convert เป็น Moment Opportunities"
      >
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          <Plus size={14} /> Add Moment (Manual)
        </button>
      </PageHeader>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Signal Source
        </span>
        {SOURCE_GROUPS.map((g) => (
          <button
            key={g.label}
            onClick={() => setSourceGroup(g.label)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              sourceGroup === g.label
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {g.label}
          </button>
        ))}
        <span className="ml-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Priority
        </span>
        {PRIORITIES.map((p) => (
          <button
            key={p}
            onClick={() => setPrio(p)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              prio === p
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {p === "ALL" ? "ทั้งหมด" : p}
          </button>
        ))}
      </div>

      {added.length > 0 && (
        <Card className="mb-4 border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-800">
          ✅ เพิ่ม Moment ใหม่ {added.length} รายการ (Mock — ยังไม่บันทึกลงฐานข้อมูล):{" "}
          {added.map((a) => `${a.account} → ${a.moment}`).join(", ")}
        </Card>
      )}

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
            {events.map((e) => {
              const acc = accountById.get(e.accountId)!;
              return (
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
                    <MomentChip code={e.momentType} small />
                    <span className="mt-1 block text-[11px] text-slate-500">{e.subMoment}</span>
                  </td>
                  <td className="max-w-[220px] px-4 py-3">
                    <span className="text-[11px] font-semibold text-slate-600">{e.triggerSource}</span>
                    <span className="block truncate text-[11px] text-slate-400">{e.triggerDetail}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{shortDate(e.expectedEventDate)}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                    {walletRange(e.potentialWalletMin, e.potentialWalletMax)}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-slate-500">{userName(e.ownerId)}</td>
                  <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {events.length === 0 && (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-400">
            <RadarIcon size={16} /> ไม่พบ Moment ตามเงื่อนไข
          </div>
        )}
      </Card>

      {showAdd && (
        <AddMomentModal
          onClose={() => setShowAdd(false)}
          onAdd={(m) => {
            setAdded((prev) => [...prev, m]);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

function AddMomentModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (m: { account: string; moment: string; trigger: string; date: string }) => void;
}) {
  const [account, setAccount] = useState(ACCOUNTS[0].name);
  const [moment, setMoment] = useState(MASTER_MOMENTS[0].code);
  const [trigger, setTrigger] = useState("");
  const [date, setDate] = useState("2026-10-01");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-md p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Add Moment (Manual — Level 1)</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 text-xs">
          <label className="block">
            <span className="mb-1 block font-semibold text-slate-600">Account</span>
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-300"
            >
              {ACCOUNTS.map((a) => (
                <option key={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold text-slate-600">Moment</span>
            <select
              value={moment}
              onChange={(e) => setMoment(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-300"
            >
              {MASTER_MOMENTS.map((m) => (
                <option key={m.code}>{m.code}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold text-slate-600">Trigger</span>
            <input
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder="เช่น ลูกค้าแจ้งในมีตติ้งว่ากำลังจะย้ายออฟฟิศ"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-300"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold text-slate-600">Expected Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-300"
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">
            ยกเลิก
          </button>
          <button
            onClick={() => onAdd({ account, moment, trigger, date })}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            สร้าง Moment Event
          </button>
        </div>
      </Card>
    </div>
  );
}
