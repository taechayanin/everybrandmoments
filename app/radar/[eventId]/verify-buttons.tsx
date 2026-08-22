"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { confirmMomentAction, rejectMomentAction } from "./actions";

export function VerifyButtons({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: (id: string) => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await action(eventId);
      if (res.ok) router.refresh();
      else setError(res.error ?? "ไม่สำเร็จ");
    });
  }

  return (
    <div>
      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={() => run(confirmMomentAction)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400"
        >
          <CheckCircle2 size={14} /> ยืนยัน Moment นี้
        </button>
        <button
          disabled={pending}
          onClick={() => run(rejectMomentAction)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:border-slate-200 disabled:text-slate-400"
        >
          <XCircle size={14} /> ไม่ใช่ Moment จริง
        </button>
      </div>
      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</p>
      )}
    </div>
  );
}
