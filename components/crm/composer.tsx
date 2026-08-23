"use client";

// Activity Composer (spec §12–§14): one drawer, three modes, <60s to save.
// No business rules here — every submit goes through the server action →
// application use case pipeline; this component only shapes the payload.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createNoteAction,
  logCallAction,
  logMeetingAction,
} from "@/app/accounts/[id]/actions";
import {
  CALL_OUTCOMES,
  INTERACTION_NEXT_STATES,
  MEETING_TYPES,
} from "@/lib/domain/activity";
import type { CrmContact, MomentEvent, Opportunity } from "@/lib/types";
import { Drawer, Field, inputCls } from "./drawer";

export type ComposerMode = "NOTE" | "CALL" | "MEETING";

const MODE_LABEL: Record<ComposerMode, string> = {
  NOTE: "+ Note",
  CALL: "📞 Log Call",
  MEETING: "📅 Log Meeting",
};

function nowLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function Composer({
  accountId,
  mode,
  contacts,
  activeMoments,
  openOpportunities,
  onClose,
}: {
  accountId: string;
  mode: ComposerMode | null;
  contacts: CrmContact[];
  activeMoments: MomentEvent[];
  openOpportunities: Opportunity[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One idempotency key per drawer session — a retried submit dedupes, a
  // fresh open gets a fresh key.
  const requestId = useMemo(() => crypto.randomUUID(), []);

  // Shared fields
  const [contactId, setContactId] = useState("");
  const [body, setBody] = useState("");
  const [occurredAt, setOccurredAt] = useState(nowLocalInput);
  const [momentEventId, setMomentEventId] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [nextState, setNextState] = useState("");
  const [createFollowUp, setCreateFollowUp] = useState(false);
  const [nextAction, setNextAction] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  // Call
  const [outcome, setOutcome] = useState("CONNECTED");
  const [durationMinutes, setDurationMinutes] = useState("");
  // Meeting
  const [meetingType, setMeetingType] = useState("ONLINE");
  const [locationOrChannel, setLocationOrChannel] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");

  if (!mode) return null;

  const followUpRequired = createFollowUp || nextState === "FOLLOW_UP";

  async function submit() {
    setPending(true);
    setError(null);
    const base = {
      accountId,
      clientRequestId: requestId,
      ...(contactId && { contactId }),
      ...(momentEventId && { momentEventId }),
      ...(opportunityId && { opportunityId }),
      ...(nextState && { nextState }),
      ...(createFollowUp && { createFollowUp: true }),
      ...(nextAction && { nextAction }),
      ...(nextActionAt && { nextActionAt }),
    };
    let result;
    if (mode === "NOTE") {
      result = await createNoteAction({ ...base, body, occurredAt });
    } else if (mode === "CALL") {
      result = await logCallAction({
        ...base,
        occurredAt,
        outcome,
        ...(body && { body }),
        ...(durationMinutes && { durationMinutes: Number(durationMinutes) }),
      });
    } else {
      result = await logMeetingAction({
        ...base,
        occurredAt,
        body,
        meetingType,
        ...(locationOrChannel && { locationOrChannel }),
        ...(budgetMin && { budgetMin: Number(budgetMin) }),
        ...(budgetMax && { budgetMax: Number(budgetMax) }),
      });
    }
    setPending(false);
    if (result.ok) {
      router.refresh();
      onClose();
    } else {
      setError(result.error ?? "บันทึกไม่สำเร็จ");
    }
  }

  return (
    <Drawer open title={MODE_LABEL[mode]} onClose={onClose}>
      <form
        className="space-y-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact">
            <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={inputCls}>
              <option value="">— ไม่ระบุ —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="วัน/เวลา" required>
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className={inputCls}
              required
            />
          </Field>
        </div>

        {mode === "CALL" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Outcome" required>
              <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={inputCls}>
                {CALL_OUTCOMES.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </Field>
            <Field label="ระยะเวลา (นาที)">
              <input
                type="number"
                min={0}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className={inputCls}
                placeholder="เช่น 15"
              />
            </Field>
          </div>
        )}

        {mode === "MEETING" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Meeting Type" required>
                <select value={meetingType} onChange={(e) => setMeetingType(e.target.value)} className={inputCls}>
                  {MEETING_TYPES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </Field>
              <Field label="สถานที่ / ช่องทาง">
                <input value={locationOrChannel} onChange={(e) => setLocationOrChannel(e.target.value)} className={inputCls} placeholder="เช่น Google Meet" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="งบประมาณ (ต่ำสุด)">
                <input type="number" min={0} value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} className={inputCls} placeholder="฿" />
              </Field>
              <Field label="งบประมาณ (สูงสุด)">
                <input type="number" min={0} value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} className={inputCls} placeholder="฿" />
              </Field>
            </div>
          </>
        )}

        <Field label={mode === "CALL" ? "บันทึกการโทร" : "รายละเอียด"} required={mode !== "CALL"}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className={inputCls}
            placeholder="สิ่งที่คุยกับลูกค้า ความต้องการ งบประมาณ ไทม์ไลน์..."
            required={mode !== "CALL"}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Related Moment">
            <select value={momentEventId} onChange={(e) => setMomentEventId(e.target.value)} className={inputCls}>
              <option value="">— ไม่ผูก —</option>
              {activeMoments.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.momentType} · {m.subMoment.slice(0, 30)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Related Opportunity">
            <select value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)} className={inputCls}>
              <option value="">— ไม่ผูก —</option>
              {openOpportunities.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name.slice(0, 40)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          <p className="text-[11px] font-bold text-slate-700">Next State — จบ interaction นี้แล้วไปไหนต่อ</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Field label="Next State">
              <select value={nextState} onChange={(e) => setNextState(e.target.value)} className={inputCls}>
                <option value="">— ไม่ระบุ —</option>
                {INTERACTION_NEXT_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            <label className="flex items-end gap-2 pb-1.5 text-[11px] font-medium text-slate-600">
              <input
                type="checkbox"
                checked={createFollowUp}
                onChange={(e) => setCreateFollowUp(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
              />
              สร้าง Follow-up Task ด้วย
            </label>
          </div>
          {(followUpRequired || nextAction || nextActionAt) && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Field label="Next Action" required={followUpRequired}>
                <input
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  className={inputCls}
                  placeholder="เช่น ส่ง sample วันศุกร์"
                  required={followUpRequired}
                />
              </Field>
              <Field label="นัดติดตามเมื่อ" required={followUpRequired}>
                <input
                  type="datetime-local"
                  value={nextActionAt}
                  onChange={(e) => setNextActionAt(e.target.value)}
                  className={inputCls}
                  required={followUpRequired}
                />
              </Field>
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3.5 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? "กำลังบันทึก..." : createFollowUp ? "Save + Follow-up" : "บันทึก"}
          </button>
        </div>
      </form>
    </Drawer>
  );
}
