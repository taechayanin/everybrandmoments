"use client";

// Create Project wizard (Step 4 §5) — 4 steps: Context → Commercial →
// People/Solutions → Next Action. Saving creates a DRAFT (never silently
// activates). One clientRequestId per logical submit: retries reuse it,
// success regenerates it. All validation authority stays server-side.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addProjectContactAction,
  createProjectAction,
  loadWizardContextAction,
} from "@/app/opportunities/actions";
import { Drawer, Field, inputCls } from "@/components/crm/drawer";
import { PROJECT_CONTACT_ROLES } from "@/lib/domain/opportunity";

type WizardContext = {
  account: { id: string; name: string; industryId: string | null };
  moments: { id: string; momentType: string; thai: string; subMoment: string; status: string }[];
  contacts: { id: string; name: string; jobTitle: string | null }[];
  industries: { id: string; nameTh: string; parentId: string | null }[];
  projectTypes: { id: string; nameTh: string }[];
  solutionsByMoment: Record<string, { id: string; name: string }[]>;
};

const ROLE_TH: Record<string, string> = {
  DECISION_MAKER: "ผู้ตัดสินใจ",
  CHAMPION: "ผู้สนับสนุน",
  PROCUREMENT: "จัดซื้อ",
  MAIN_CONTACT: "ผู้ติดต่อหลัก",
};

const STEP_TITLES = ["1 · Context", "2 · Commercial", "3 · คน / Solutions", "4 · Next Action"];

export function CreateProjectWizard({
  accounts,
  ownerId,
}: {
  accounts: { id: string; name: string }[];
  ownerId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [ctx, setCtx] = useState<WizardContext | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One id per LOGICAL create — kept across retries, replaced after success.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  // Step 1 — context
  const [accountId, setAccountId] = useState("");
  const [industryId, setIndustryId] = useState("");
  const [subIndustryId, setSubIndustryId] = useState("");
  const [momentEventId, setMomentEventId] = useState("");
  const [projectTypeId, setProjectTypeId] = useState("");
  // Step 2 — commercial
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [expectedRevenue, setExpectedRevenue] = useState("");
  const [expectedGP, setExpectedGP] = useState("0.38");
  const [closeDate, setCloseDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  // Step 3 — people / solutions
  const [solutionIds, setSolutionIds] = useState<string[]>([]);
  const [roleContacts, setRoleContacts] = useState<Record<string, string>>({});
  // Step 4 — next action
  const [nextAction, setNextAction] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");

  async function pickAccount(id: string) {
    setAccountId(id);
    setMomentEventId("");
    setSolutionIds([]);
    setCtx(null);
    if (!id) return;
    const result = await loadWizardContextAction(id);
    if (result.ok && result.data) {
      const data = result.data as WizardContext;
      setCtx(data);
      // Industry prefills from the account — the account may map at
      // sub-industry level, so resolve sub → its group + sub pair.
      const acc = data.industries.find((i) => i.id === data.account.industryId);
      if (acc?.parentId) {
        setIndustryId(acc.parentId);
        setSubIndustryId(acc.id);
      } else {
        setIndustryId(acc?.id ?? "");
        setSubIndustryId("");
      }
    } else if (!result.ok) {
      setError(result.error);
    }
  }

  const groups = ctx?.industries.filter((i) => i.parentId === null) ?? [];
  const subs = ctx?.industries.filter((i) => i.parentId === industryId) ?? [];
  const selectedMoment = ctx?.moments.find((m) => m.id === momentEventId);
  const solutions = selectedMoment
    ? (ctx?.solutionsByMoment[selectedMoment.momentType] ?? [])
    : [];

  const canNext =
    step === 0
      ? accountId && industryId && momentEventId && projectTypeId
      : step === 1
        ? name.trim().length >= 3 && expectedRevenue && closeDate
        : true;

  async function submit() {
    setPending(true);
    setError(null);
    const result = await createProjectAction({
      accountId: accountId as never,
      momentEventId: momentEventId as never,
      name: name.trim(),
      ...(brief.trim() ? { brief: brief.trim() } : {}),
      industryId: industryId as never,
      ...(subIndustryId ? { subIndustryId: subIndustryId as never } : {}),
      projectTypeId: projectTypeId as never,
      expectedRevenue: Number(expectedRevenue),
      expectedGP: Number(expectedGP),
      closeDate,
      ...(deliveryDate ? { expectedDeliveryDate: deliveryDate } : {}),
      ownerId: ownerId as never,
      nextAction: nextAction.trim() || "กำหนด Next Action",
      ...(nextActionDate ? { nextActionDate } : {}),
      ...(solutionIds.length ? { solutionIds: solutionIds as never } : {}),
      clientRequestId: requestId,
    });
    if (result.ok && result.data) {
      // Contact-role links ride after the idempotent create (each idempotent
      // by the (opportunity, contact, role) unique key).
      for (const [role, contactId] of Object.entries(roleContacts)) {
        if (contactId) {
          await addProjectContactAction({
            opportunityId: result.data.projectId,
            contactId,
            role,
          });
        }
      }
      setPending(false);
      setRequestId(crypto.randomUUID()); // next logical create = new id
      setOpen(false);
      resetForm();
      router.refresh();
    } else if (!result.ok) {
      setPending(false);
      // IDEMPOTENCY_CONFLICT and gate errors render verbatim; requestId is
      // kept so a pure retry stays idempotent.
      setError(result.error);
    }
  }

  function resetForm() {
    setStep(0);
    setAccountId("");
    setIndustryId("");
    setSubIndustryId("");
    setMomentEventId("");
    setProjectTypeId("");
    setName("");
    setBrief("");
    setExpectedRevenue("");
    setCloseDate("");
    setDeliveryDate("");
    setSolutionIds([]);
    setRoleContacts({});
    setNextAction("");
    setNextActionDate("");
    setCtx(null);
    setError(null);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
      >
        + สร้าง Project
      </button>
      <Drawer open={open} title="สร้าง Project ใหม่" onClose={() => setOpen(false)}>
        <div className="mb-4 flex gap-1">
          {STEP_TITLES.map((t, i) => (
            <span
              key={t}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                i === step ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              {t}
            </span>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <Field label="ลูกค้า *">
              <select value={accountId} onChange={(e) => void pickAccount(e.target.value)} className={inputCls}>
                <option value="">— เลือกลูกค้า —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
            <Field label="อุตสาหกรรม * (เติมจากลูกค้า — ยืนยัน/แก้ได้)">
              <select value={industryId} onChange={(e) => { setIndustryId(e.target.value); setSubIndustryId(""); }} className={inputCls} disabled={!ctx}>
                <option value="">— เลือก —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.nameTh}</option>
                ))}
              </select>
            </Field>
            <Field label="ประเภทธุรกิจย่อย (ถ้ามี)">
              <select value={subIndustryId} onChange={(e) => setSubIndustryId(e.target.value)} className={inputCls} disabled={subs.length === 0}>
                <option value="">— ไม่ระบุ —</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>{s.nameTh}</option>
                ))}
              </select>
            </Field>
            <Field label="โมเมนต์ธุรกิจ * (จาก Moment ของลูกค้ารายนี้)">
              <select value={momentEventId} onChange={(e) => setMomentEventId(e.target.value)} className={inputCls} disabled={!ctx}>
                <option value="">— เลือก Moment —</option>
                {ctx?.moments.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.thai} — {m.subMoment}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="ประเภทโปรเจกต์ *">
              {/* selectable master เท่านั้น — PT-UNSPECIFIED ไม่มีในรายการ */}
              <select value={projectTypeId} onChange={(e) => setProjectTypeId(e.target.value)} className={inputCls} disabled={!ctx}>
                <option value="">— เลือก —</option>
                {ctx?.projectTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.nameTh}</option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <Field label="ชื่อโปรเจกต์ *">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="เช่น ABC Clinic — เปิดสาขาบางแค" />
            </Field>
            <Field label="Brief / ความต้องการลูกค้า">
              <textarea value={brief} onChange={(e) => setBrief(e.target.value)} className={`${inputCls} min-h-20`} />
            </Field>
            <Field label="มูลค่าคาดการณ์ (บาท) *">
              <input type="number" min={0} value={expectedRevenue} onChange={(e) => setExpectedRevenue(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Target GP (0–1)">
              <input type="number" min={0} max={1} step={0.01} value={expectedGP} onChange={(e) => setExpectedGP(e.target.value)} className={inputCls} />
            </Field>
            <Field label="วันที่คาดว่าจะปิด *">
              <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="วันที่คาดว่าจะส่งมอบ">
              <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={inputCls} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <Field label={`Solutions ที่เกี่ยวข้อง (${solutions.length} รายการจาก Moment ที่เลือก)`}>
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {solutions.length === 0 && (
                  <p className="text-[11px] text-slate-400">เลือก Moment ในขั้นที่ 1 ก่อน</p>
                )}
                {solutions.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-[11px] text-slate-700">
                    <input
                      type="checkbox"
                      checked={solutionIds.includes(s.id)}
                      onChange={(e) =>
                        setSolutionIds((prev) =>
                          e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id),
                        )
                      }
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </Field>
            {PROJECT_CONTACT_ROLES.map((role) => (
              <Field key={role} label={ROLE_TH[role]}>
                <select
                  value={roleContacts[role] ?? ""}
                  onChange={(e) => setRoleContacts((prev) => ({ ...prev, [role]: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">— ไม่ระบุ —</option>
                  {ctx?.contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.jobTitle ? ` (${c.jobTitle})` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <Field label="Next Action *">
              <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} className={inputCls} placeholder="เช่น นัด discovery call" />
            </Field>
            <Field label="วันที่ Next Action">
              <input type="date" value={nextActionDate} onChange={(e) => setNextActionDate(e.target.value)} className={inputCls} />
            </Field>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              บันทึกแล้วโปรเจกต์จะเป็น <b>ฉบับร่าง (DRAFT)</b> — กด &quot;Activate&quot; ภายหลัง
              เมื่อข้อมูลครบเพื่อเข้าสู่ Pipeline
            </p>
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{error}</p>
        )}

        <div className="mt-4 flex justify-between">
          <button
            disabled={step === 0 || pending}
            onClick={() => setStep((s) => s - 1)}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40"
          >
            ← ย้อนกลับ
          </button>
          {step < 3 ? (
            <button
              disabled={!canNext || pending}
              onClick={() => setStep((s) => s + 1)}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              ถัดไป →
            </button>
          ) : (
            <button
              disabled={pending || !nextAction.trim()}
              onClick={() => void submit()}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              {pending ? "กำลังบันทึก…" : "บันทึกเป็นฉบับร่าง"}
            </button>
          )}
        </div>
      </Drawer>
    </>
  );
}
