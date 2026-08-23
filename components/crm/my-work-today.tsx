"use client";

// My Work Today (spec §18): the Command Center answers "วันนี้ต้องทำอะไร"
// without hunting through accounts. Bands come from the org-local read model;
// completing goes through the idempotent server action.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completeTaskAction } from "@/app/accounts/[id]/actions";
import type { CrmTask } from "@/lib/types";
import type { MyWorkTodayView } from "@/lib/application/tasks/get-my-work-today";

const BANDS: { key: "overdue" | "dueToday" | "upcoming"; label: string; cls: string; badge: string }[] = [
  { key: "overdue", label: "เกินกำหนด", cls: "text-rose-600", badge: "bg-rose-100 text-rose-700" },
  { key: "dueToday", label: "วันนี้", cls: "text-amber-600", badge: "bg-amber-100 text-amber-700" },
  { key: "upcoming", label: "ถัดไป", cls: "text-slate-500", badge: "bg-slate-100 text-slate-600" },
];

export function MyWorkToday({
  work,
  accountNames,
}: {
  work: MyWorkTodayView;
  accountNames: Record<string, string>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = work.overdue.length + work.dueToday.length + work.upcoming.length;

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
      <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center">
        <p className="text-sm font-semibold text-slate-500">ไม่มี Task ค้างวันนี้ 🎉</p>
        <p className="mt-1 text-xs text-slate-400">
          บันทึก interaction พร้อม Follow-up จากหน้า Account เพื่อวางงานถัดไป
        </p>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {BANDS.map((band) => (
          <div key={band.key} className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
            <p className={`flex items-center justify-between text-[10px] font-bold uppercase tracking-wide ${band.cls}`}>
              {band.label}
              <span className={`rounded-full px-1.5 py-0.5 ${band.badge}`}>
                {work[band.key].length}
              </span>
            </p>
            {work[band.key].length === 0 ? (
              <p className="mt-2 text-[11px] text-slate-300">— ว่าง —</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {work[band.key].map((t) => (
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
                        {t.accountId && accountNames[t.accountId] ? (
                          <Link
                            href={`/accounts/${t.accountId}`}
                            className="font-semibold text-indigo-600 hover:underline"
                          >
                            {accountNames[t.accountId]}
                          </Link>
                        ) : null}
                        {t.dueDate && <span> · {t.dueDate}</span>}
                        {t.priority !== "NORMAL" && (
                          <span className={`ml-1 font-bold ${t.priority === "URGENT" ? "text-rose-500" : "text-amber-600"}`}>
                            {t.priority}
                          </span>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
