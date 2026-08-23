"use client";

// Contacts + Buying Committee (spec §15–§16): who are we talking to, and who
// decides. Create/edit go through server actions only.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Phone, Plus, Star } from "lucide-react";
import { ADD_CONTACT_EVENT } from "./quick-actions";
import {
  createContactAction,
  updateContactAction,
} from "@/app/accounts/[id]/actions";
import { CONTACT_ROLES, INFLUENCE_LEVELS } from "@/lib/domain/activity";
import type { ContactRole, CrmContact } from "@/lib/types";
import { Drawer, Field, inputCls } from "./drawer";

const ROLE_BADGE: Record<ContactRole, { label: string; cls: string }> = {
  DECISION_MAKER: { label: "Decision Maker", cls: "bg-indigo-600 text-white" },
  CHAMPION: { label: "Champion", cls: "bg-emerald-100 text-emerald-800" },
  PROCUREMENT: { label: "Procurement", cls: "bg-amber-100 text-amber-800" },
  INFLUENCER: { label: "Influencer", cls: "bg-sky-100 text-sky-800" },
  USER: { label: "User", cls: "bg-slate-100 text-slate-600" },
  FINANCE: { label: "Finance", cls: "bg-violet-100 text-violet-800" },
  GATEKEEPER: { label: "Gatekeeper", cls: "bg-slate-200 text-slate-700" },
  OTHER: { label: "Other", cls: "bg-slate-100 text-slate-500" },
};

interface FormState {
  name: string;
  jobTitle: string;
  phone: string;
  email: string;
  lineId: string;
  buyingRole: string;
  influenceLevel: string;
  isPrimary: boolean;
}

const EMPTY: FormState = {
  name: "", jobTitle: "", phone: "", email: "", lineId: "",
  buyingRole: "", influenceLevel: "", isPrimary: false,
};

export function ContactsPanel({
  accountId,
  contacts,
}: {
  accountId: string;
  contacts: CrmContact[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CrmContact | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useMemo(() => crypto.randomUUID(), []);

  // Quick Actions "👤 Contact" opens this drawer via a DOM event so the page
  // layout stays server-rendered (no shared client parent needed).
  useEffect(() => {
    function onAdd() {
      setEditing("new");
      setForm(EMPTY);
    }
    window.addEventListener(ADD_CONTACT_EVENT, onAdd);
    return () => window.removeEventListener(ADD_CONTACT_EVENT, onAdd);
  }, []);

  function startEdit(c: CrmContact) {
    setEditing(c);
    setForm({
      name: c.name,
      jobTitle: c.jobTitle ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      lineId: c.lineId ?? "",
      buyingRole: c.buyingRole ?? "",
      influenceLevel: c.influenceLevel ?? "",
      isPrimary: c.isPrimary,
    });
  }

  async function submit() {
    setPending(true);
    setError(null);
    const fields = {
      name: form.name,
      ...(form.jobTitle && { jobTitle: form.jobTitle }),
      ...(form.phone && { phone: form.phone }),
      ...(form.email && { email: form.email }),
      ...(form.lineId && { lineId: form.lineId }),
      ...(form.buyingRole && { buyingRole: form.buyingRole }),
      ...(form.influenceLevel && { influenceLevel: form.influenceLevel }),
      isPrimary: form.isPrimary,
    };
    const result =
      editing === "new"
        ? await createContactAction({ accountId, clientRequestId: requestId, ...fields })
        : await updateContactAction({ contactId: (editing as CrmContact).id, ...fields });
    setPending(false);
    if (result.ok) {
      setEditing(null);
      router.refresh();
    } else {
      setError(result.error ?? "บันทึกไม่สำเร็จ");
    }
  }

  return (
    <div>
      <div className="divide-y divide-slate-50">
        {contacts.length === 0 && (
          <p className="px-4 py-4 text-center text-xs text-slate-400">
            ยังไม่มี Contact — เพิ่มคนแรกเลย
          </p>
        )}
        {contacts.map((c) => (
          <div key={c.id} className="group flex items-start justify-between gap-2 px-4 py-2.5">
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-xs font-semibold text-slate-800">
                {c.isPrimary && <Star size={10} className="fill-amber-400 text-amber-400" />}
                <span className="truncate">{c.name}</span>
              </p>
              <p className="truncate text-[11px] text-slate-400">{c.jobTitle ?? "—"}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {c.buyingRole && (
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${ROLE_BADGE[c.buyingRole].cls}`}>
                    {ROLE_BADGE[c.buyingRole].label}
                  </span>
                )}
                {c.influenceLevel && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                    Influence: {c.influenceLevel}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {c.phone && (
                <span className="flex items-center gap-1 text-[10px] text-slate-500">
                  <Phone size={10} /> {c.phone}
                </span>
              )}
              <button
                type="button"
                onClick={() => startEdit(c)}
                className="rounded p-1 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-600"
                aria-label={`แก้ไข ${c.name}`}
              >
                <Pencil size={11} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          setEditing("new");
          setForm(EMPTY);
        }}
        className="flex w-full items-center justify-center gap-1 border-t border-slate-50 py-2 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50/50"
      >
        <Plus size={11} /> เพิ่ม Contact
      </button>

      <Drawer
        open={editing !== null}
        title={editing === "new" ? "👤 เพิ่ม Contact" : "แก้ไข Contact"}
        onClose={() => setEditing(null)}
      >
        <form
          className="space-y-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="ชื่อ" required>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ตำแหน่งงาน">
              <input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} className={inputCls} placeholder="เช่น Marketing Manager" />
            </Field>
            <Field label="เบอร์โทร">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
            </Field>
            <Field label="LINE ID">
              <input value={form.lineId} onChange={(e) => setForm({ ...form, lineId: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Buying Role">
              <select value={form.buyingRole} onChange={(e) => setForm({ ...form, buyingRole: e.target.value })} className={inputCls}>
                <option value="">— ไม่ระบุ —</option>
                {CONTACT_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_BADGE[r].label}</option>
                ))}
              </select>
            </Field>
            <Field label="Influence">
              <select value={form.influenceLevel} onChange={(e) => setForm({ ...form, influenceLevel: e.target.value })} className={inputCls}>
                <option value="">— ไม่ระบุ —</option>
                {INFLUENCE_LEVELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={form.isPrimary}
              onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
            />
            Primary Contact
          </label>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-3.5 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">
              ยกเลิก
            </button>
            <button type="submit" disabled={pending} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
              {pending ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
