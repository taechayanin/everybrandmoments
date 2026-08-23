"use client";

// Controlled stage-change menu (Step 4) — the ONLY way stage moves from the
// UI, and it goes UI → server action → updateProjectStage use case. No rule
// lives here: the canonical transition map decides; we merely render errors.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProjectStageAction } from "@/app/opportunities/actions";
import {
  SALES_STAGES,
  SALES_STAGE_TH,
  canChangeSalesStage,
  isBackwardStageMove,
  type SalesStage,
} from "@/lib/domain/opportunity";

export function StageMenu({
  opportunityId,
  currentStage,
}: {
  opportunityId: string;
  currentStage: SalesStage;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<SalesStage | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  // Advisory pre-filter only — the use case remains authoritative.
  const targets = SALES_STAGES.filter((s) => canChangeSalesStage(currentStage, s));

  async function submit(toStage: SalesStage, moveReason?: string) {
    setPending(true);
    setError(null);
    const result = await updateProjectStageAction({
      opportunityId,
      toStage,
      ...(moveReason?.trim() ? { reason: moveReason.trim() } : {}),
      clientRequestId: requestId,
    });
    setPending(false);
    if (result.ok) {
      setRequestId(crypto.randomUUID());
      setOpen(false);
      setTarget(null);
      setReason("");
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-200"
      >
        ย้าย Stage ▾
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
          {targets.map((s) => (
            <button
              key={s}
              disabled={pending}
              onClick={() => {
                if (isBackwardStageMove(currentStage, s)) {
                  setTarget(s); // backward needs a reason — ask inline
                } else {
                  void submit(s);
                }
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left text-[11px] text-slate-700 hover:bg-indigo-50"
            >
              {isBackwardStageMove(currentStage, s) ? "↩ " : "→ "}
              {SALES_STAGE_TH[s]}
            </button>
          ))}
          {target && (
            <div className="mt-1 border-t border-slate-100 p-1.5">
              <p className="mb-1 text-[10px] font-semibold text-amber-700">
                ถอยไป {SALES_STAGE_TH[target]} — ระบุเหตุผล
              </p>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="เหตุผล"
                className="w-full rounded-md border border-slate-200 px-2 py-1 text-[11px] outline-none focus:border-indigo-300"
              />
              <button
                disabled={pending || !reason.trim()}
                onClick={() => void submit(target, reason)}
                className="mt-1.5 w-full rounded-md bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
              >
                ยืนยันถอย Stage
              </button>
            </div>
          )}
          {error && (
            <p className="mt-1 px-2 pb-1 text-[10px] text-rose-600">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
