"use client";

// AI Suggestions (spec §22–§23): suggestion data only until a human decides.
// Accept routes through the atomic decision write; Ignore never creates
// anything. Buttons disable while pending — retries are idempotent anyway.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import {
  acceptSuggestionAction,
  ignoreSuggestionAction,
} from "@/app/accounts/[id]/actions";
import type { ActivitySuggestion } from "@/lib/types";

export function SuggestionsPanel({ suggestions }: { suggestions: ActivitySuggestion[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (suggestions.length === 0) return null;

  async function decide(id: string, kind: "accept" | "ignore") {
    setBusy(id);
    setError(null);
    const action = kind === "accept" ? acceptSuggestionAction : ignoreSuggestionAction;
    const result = await action({ suggestionId: id });
    setBusy(null);
    if (result.ok) router.refresh();
    else setError(result.error ?? "บันทึกไม่สำเร็จ");
  }

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-800">
        <Sparkles size={12} /> AI พบ {suggestions.length} insight จากบทสนทนา
      </p>
      {error && (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
      )}
      <div className="mt-2 space-y-2">
        {suggestions.map((s) => {
          const p = s.payload;
          return (
            <div key={s.id} className="rounded-lg border border-indigo-100 bg-white p-3">
              <p className="text-xs font-semibold text-slate-800">{p.summary}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                {p.detectedMomentCodes.map((c) => (
                  <span key={c} className="rounded bg-indigo-600 px-1.5 py-0.5 font-bold text-white">
                    ⚡ {c}
                  </span>
                ))}
                {p.budgetMax !== undefined && (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">
                    💰 ~฿{Math.round(p.budgetMax / 1000)}K
                  </span>
                )}
                {p.expectedDate && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">
                    📅 {p.expectedDate}
                  </span>
                )}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-500">
                  ความมั่นใจ {(s.confidence ?? p.confidence) * 100}%
                </span>
              </div>
              {p.needs.length > 0 && (
                <p className="mt-1.5 text-[11px] text-slate-600">
                  🎯 {p.needs.join(" · ")}
                </p>
              )}
              {p.nextAction && (
                <p className="mt-1 text-[11px] font-medium text-amber-800">
                  ⏭ {p.nextAction}
                  {p.nextActionDate ? ` — ${p.nextActionDate}` : ""}
                </p>
              )}
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  disabled={busy === s.id}
                  onClick={() => void decide(s.id, "accept")}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busy === s.id ? "กำลังบันทึก..." : "Accept"}
                </button>
                <button
                  type="button"
                  disabled={busy === s.id}
                  onClick={() => void decide(s.id, "ignore")}
                  className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
                >
                  Ignore
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
