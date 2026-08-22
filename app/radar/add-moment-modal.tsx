"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { Card } from "@/components/ui";
import type { AccountId, MomentCode } from "@/lib/types";
import { createMomentAction } from "./actions";

interface Props {
  accountOptions: { id: AccountId; name: string }[];
  momentCodes: MomentCode[];
}

export function AddMomentButton({ accountOptions, momentCodes }: Props) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
      >
        <Plus size={14} /> Add Moment (Manual)
      </button>
      {result && (
        <p className="w-full rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          ✅ {result}
        </p>
      )}
      {open && (
        <AddMomentModal
          accountOptions={accountOptions}
          momentCodes={momentCodes}
          onClose={() => setOpen(false)}
          onCreated={(id) => {
            setResult(`สร้าง Moment Event ${id} แล้ว`);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function AddMomentModal({
  accountOptions,
  momentCodes,
  onClose,
  onCreated,
}: Props & { onClose: () => void; onCreated: (id: string) => void }) {
  const [accountId, setAccountId] = useState<AccountId>(accountOptions[0].id);
  const [moment, setMoment] = useState<MomentCode>(momentCodes[0]);
  const [trigger, setTrigger] = useState("");
  const [subMoment, setSubMoment] = useState("");
  const [date, setDate] = useState("2026-10-01");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await createMomentAction({
        accountId,
        momentType: moment,
        subMoment: subMoment || moment,
        stakeholders: ["Business"],
        triggerDetail: trigger,
        expectedEventDate: date,
        potentialWalletMin: 50000,
        potentialWalletMax: 150000,
        ownerId: "USR-010",
      });
      if (res.ok && res.eventId) onCreated(res.eventId);
      else setError(res.error ?? "สร้างไม่สำเร็จ");
    });
  }

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
              value={accountId}
              onChange={(e) => setAccountId(e.target.value as AccountId)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-300"
            >
              {accountOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold text-slate-600">Moment</span>
            <select
              value={moment}
              onChange={(e) => setMoment(e.target.value as MomentCode)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-300"
            >
              {momentCodes.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-semibold text-slate-600">Sub Moment</span>
            <input
              value={subMoment}
              onChange={(e) => setSubMoment(e.target.value)}
              placeholder="เช่น เปิดสาขาใหม่สุขุมวิท"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-indigo-300"
            />
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
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">
            ยกเลิก
          </button>
          <button
            onClick={submit}
            disabled={pending || trigger.length === 0}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400"
          >
            {pending ? "กำลังสร้าง…" : "สร้าง Moment Event"}
          </button>
        </div>
      </Card>
    </div>
  );
}
