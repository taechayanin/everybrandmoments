"use client";

// Activity Timeline (spec §8, §30): keyset load-more, filter chips,
// loading / empty / error states. Data always arrives via loadTimelineAction
// → getAccountTimeline — this component never derives business meaning.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  deleteActivityAction,
  loadTimelineAction,
} from "@/app/accounts/[id]/actions";
import type { Activity, ActivityType } from "@/lib/types";
import type { ContactRef } from "@/lib/application/accounts/get-account-360";

const FILTERS: { label: string; types?: ActivityType[] }[] = [
  { label: "ทั้งหมด" },
  { label: "Notes", types: ["NOTE"] },
  { label: "Calls", types: ["CALL"] },
  { label: "Meetings", types: ["MEETING"] },
  { label: "Tasks", types: ["TASK", "TASK_COMPLETED"] },
  { label: "Moments", types: ["MOMENT_DETECTED", "MOMENT_VERIFIED", "MOMENT_REJECTED"] },
  { label: "System", types: ["SYSTEM", "OPPORTUNITY_CREATED", "OPPORTUNITY_STAGE_CHANGED", "OPPORTUNITY_WON", "OPPORTUNITY_LOST"] },
];

const TYPE_ICON: Partial<Record<ActivityType, string>> = {
  NOTE: "📝", CALL: "📞", MEETING: "📅", EMAIL: "✉️", LINE: "💬", VISIT: "🏢",
  TASK: "✅", TASK_COMPLETED: "✅",
  MOMENT_DETECTED: "🤖", MOMENT_VERIFIED: "⚡", MOMENT_REJECTED: "⛔",
  OPPORTUNITY_CREATED: "💰", OPPORTUNITY_STAGE_CHANGED: "💰",
  OPPORTUNITY_WON: "🏆", OPPORTUNITY_LOST: "💤", SYSTEM: "⚙️",
};

const EDITABLE: ActivityType[] = ["NOTE", "CALL", "MEETING", "EMAIL", "LINE", "VISIT"];

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric", month: "short", year: "2-digit",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok",
  });
}

export function ActivityTimeline({
  accountId,
  initialItems,
  initialCursor,
  initialContacts,
}: {
  accountId: string;
  initialItems: Activity[];
  initialCursor?: string;
  initialContacts: Record<string, ContactRef>;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [contacts, setContacts] = useState(initialContacts);
  const [filter, setFilter] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function fetchPage(nextFilter: number, nextCursor?: string, append = false) {
    setLoading(true);
    setError(null);
    const result = await loadTimelineAction({
      accountId,
      ...(nextCursor && { cursor: nextCursor }),
      ...(FILTERS[nextFilter].types && { types: FILTERS[nextFilter].types }),
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "โหลดไม่สำเร็จ");
      return;
    }
    const page = (result.items ?? []) as Activity[];
    setItems((prev) => (append ? [...prev, ...page] : page));
    setCursor(result.nextCursor);
    if (result.contacts) setContacts((prev) => ({ ...prev, ...result.contacts }));
  }

  async function remove(id: string) {
    if (!window.confirm("ลบรายการนี้? (soft delete — มี audit)")) return;
    const result = await deleteActivityAction(id);
    if (result.ok) {
      setItems((prev) => prev.filter((a) => a.id !== id));
      startTransition(() => router.refresh());
    } else {
      setError(result.error ?? "ลบไม่สำเร็จ");
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f, i) => (
          <button
            key={f.label}
            type="button"
            onClick={() => {
              setFilter(i);
              void fetchPage(i);
            }}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
              filter === i
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-3 flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <span>{error}</span>
          <button
            type="button"
            className="font-bold underline"
            onClick={() => void fetchPage(filter, undefined)}
          >
            ลองใหม่
          </button>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
          <p className="text-sm font-semibold text-slate-500">ยังไม่มี Activity</p>
          <p className="mt-1 text-xs text-slate-400">
            เริ่มบันทึกการคุยกับลูกค้าด้วยปุ่ม + Note / Log Call ด้านบน
          </p>
        </div>
      ) : (
        <div className="relative space-y-2.5 before:absolute before:inset-y-2 before:left-[13px] before:w-px before:bg-slate-200">
          {items.map((a) => {
            const contact = a.contactId ? contacts[a.contactId] : undefined;
            const meta = (a.metadata ?? {}) as Record<string, unknown>;
            return (
              <div key={a.id} className="relative rounded-xl border border-slate-100 bg-white p-3 pl-11 shadow-sm">
                <span className="absolute left-2 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-slate-50 text-sm ring-1 ring-slate-200">
                  {TYPE_ICON[a.activityType] ?? "•"}
                </span>
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-800">
                      {a.title ?? a.activityType}
                    </span>
                    {a.outcome && (
                      <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                        {a.outcome}
                      </span>
                    )}
                    {typeof meta.nextState === "string" && (
                      <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                        → {meta.nextState}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-slate-400">{fmtWhen(a.occurredAt)}</span>
                    {EDITABLE.includes(a.activityType) && (
                      <button
                        type="button"
                        onClick={() => void remove(a.id)}
                        className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                        aria-label="ลบ"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
                {contact && (
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    กับ <span className="font-semibold text-slate-600">{contact.name}</span>
                    {contact.jobTitle ? ` · ${contact.jobTitle}` : ""}
                  </p>
                )}
                {a.body && (
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600">
                    {a.body}
                  </p>
                )}
                {a.nextAction && (
                  <p className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
                    ⏭ {a.nextAction}
                    {a.nextActionAt ? ` — ${fmtWhen(a.nextActionAt)}` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {cursor && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void fetchPage(filter, cursor, true)}
          className="mt-3 w-full rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "กำลังโหลด..." : "โหลดเพิ่ม"}
        </button>
      )}
    </div>
  );
}
