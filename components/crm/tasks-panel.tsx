"use client";

// Tasks / Follow-ups on Account 360 (spec §17): overdue / today / upcoming
// bands computed org-local on the server; completing goes through the
// idempotent server action.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeTaskAction } from "@/app/accounts/[id]/actions";
import type { CrmTask } from "@/lib/types";
import type { AccountTaskBands } from "@/lib/application/accounts/get-account-360";

const BANDS: {
  key: keyof Omit<AccountTaskBands, "today">;
  label: string;
  cls: string;
}[] = [
  { key: "overdue", label: "เกินกำหนด", cls: "text-rose-600" },
  { key: "dueToday", label: "วันนี้", cls: "text-amber-600" },
  { key: "upcoming", label: "ถัดไป", cls: "text-slate-500" },
  { key: "unscheduled", label: "ยังไม่นัดวัน", cls: "text-slate-400" },
];

export function TasksPanel({ bands }: { bands: AccountTaskBands }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const total = BANDS.reduce((s, b) => s + bands[b.key].length, 0);

  async function complete(task: CrmTask) {
    setBusy(task.id);
    setError(null);
    const result = await completeTaskAction({ taskId: task.id });
    setBusy(null);
    if (result.ok) router.refresh();
    else setError(result.error ?? "อัปเดตไม่สำเร็จ");
  }

  if (total === 0) {
    return (
      <p className="px-4 py-4 text-center text-xs text-slate-400">
        ไม่มี Task ค้าง — บันทึก interaction พร้อม Follow-up เพื่อสร้างงานถัดไป
      </p>
    );
  }

  return (
    <div className="divide-y divide-slate-50">
      {error && (
        <p className="bg-rose-50 px-4 py-2 text-[11px] text-rose-700">{error}</p>
      )}
      {BANDS.filter((b) => bands[b.key].length > 0).map((b) => (
        <div key={b.key} className="px-4 py-2.5">
          <p className={`text-[10px] font-bold uppercase tracking-wide ${b.cls}`}>
            {b.label} · {bands[b.key].length}
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {bands[b.key].map((t) => (
              <li key={t.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  disabled={busy === t.id}
                  onChange={() => void complete(t)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
                  aria-label={`เสร็จสิ้น: ${t.title}`}
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-700">{t.title}</p>
                  <p className="text-[10px] text-slate-400">
                    {t.dueDate ?? "ไม่มีวันกำหนด"}
                    {t.priority !== "NORMAL" && (
                      <span className={`ml-1.5 font-bold ${t.priority === "URGENT" ? "text-rose-500" : t.priority === "HIGH" ? "text-amber-600" : "text-slate-400"}`}>
                        {t.priority}
                      </span>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
