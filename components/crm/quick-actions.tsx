"use client";

// Quick Actions (spec §6): primary CRM actions one click away — never hidden
// behind menus. Composer/task drawers live here; "Contact" signals the
// ContactsPanel (right rail) via a DOM event so the page can stay
// server-rendered.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createTaskAction } from "@/app/accounts/[id]/actions";
import { TASK_PRIORITIES } from "@/lib/domain/activity";
import type { CrmContact, MomentEvent, Opportunity } from "@/lib/types";
import { Composer, type ComposerMode } from "./composer";
import { Drawer, Field, inputCls } from "./drawer";

export const ADD_CONTACT_EVENT = "crm:add-contact";

export function QuickActions({
  accountId,
  contacts,
  activeMoments,
  openOpportunities,
}: {
  accountId: string;
  contacts: CrmContact[];
  activeMoments: MomentEvent[];
  openOpportunities: Opportunity[];
}) {
  const router = useRouter();
  const [composer, setComposer] = useState<ComposerMode | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useMemo(() => crypto.randomUUID(), []);

  async function submitTask() {
    setPending(true);
    setError(null);
    const result = await createTaskAction({
      accountId,
      title,
      priority,
      clientRequestId: requestId,
      ...(dueDate && { dueDate }),
      ...(description && { description }),
    });
    setPending(false);
    if (result.ok) {
      setTaskOpen(false);
      setTitle("");
      setDescription("");
      router.refresh();
    } else {
      setError(result.error ?? "บันทึกไม่สำเร็จ");
    }
  }

  const btn =
    "rounded-lg px-3 py-1.5 text-[11px] font-bold transition whitespace-nowrap";

  return (
    <>
      <div className="flex flex-wrap gap-1.5 overflow-x-auto">
        <button type="button" onClick={() => setComposer("NOTE")} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`}>
          + Note
        </button>
        <button type="button" onClick={() => setComposer("CALL")} className={`${btn} bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50`}>
          📞 Log Call
        </button>
        <button type="button" onClick={() => setComposer("MEETING")} className={`${btn} bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50`}>
          📅 Log Meeting
        </button>
        <button type="button" onClick={() => setTaskOpen(true)} className={`${btn} bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50`}>
          ✅ Task
        </button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent(ADD_CONTACT_EVENT))}
          className={`${btn} bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50`}
        >
          👤 Contact
        </button>
        {activeMoments[0] && (
          <button
            type="button"
            onClick={() => router.push(`/workspace?account=${accountId}&event=${activeMoments[0].id}`)}
            className={`${btn} bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50`}
          >
            💰 Opportunity
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push("/radar")}
          className={`${btn} bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50`}
        >
          ⚡ Moment
        </button>
      </div>

      <Composer
        accountId={accountId}
        mode={composer}
        contacts={contacts}
        activeMoments={activeMoments}
        openOpportunities={openOpportunities}
        onClose={() => setComposer(null)}
      />

      <Drawer open={taskOpen} title="✅ สร้าง Follow-up Task" onClose={() => setTaskOpen(false)}>
        <form
          className="space-y-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void submitTask();
          }}
        >
          <Field label="งานที่ต้องทำ" required>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="เช่น ส่งใบเสนอราคา" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="กำหนดเสร็จ">
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Priority">
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="รายละเอียด">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputCls} />
          </Field>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setTaskOpen(false)} className="rounded-lg px-3.5 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">
              ยกเลิก
            </button>
            <button type="submit" disabled={pending} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
              {pending ? "กำลังบันทึก..." : "สร้าง Task"}
            </button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
