import type { IndustryId, ProjectTypeId } from "./ids";

// Step 1 (Project Pipeline plan §2, migration 0009) — Thai master data.
// Canonical source for industries / project types; migration 0009 and the
// seed generator both derive from these constants, and a drift test pins the
// migration SQL to them. Internal ids/codes stay language-neutral — only
// nameTh is Thai (Thai-first UI, handoff §18).

export interface Industry {
  id: IndustryId;
  nameTh: string;
  /** null = top-level industry group (14 groups, handoff §20). */
  parentId: IndustryId | null;
  active: boolean;
}

export interface ProjectType {
  id: ProjectTypeId;
  nameTh: string;
  /** false = legacy/migration sentinel — never offered for new Projects. */
  selectable: boolean;
  active: boolean;
}

const G = (id: IndustryId, nameTh: string): Industry => ({
  id, nameTh, parentId: null, active: true,
});
const S = (id: IndustryId, parentId: IndustryId, nameTh: string): Industry => ({
  id, nameTh, parentId, active: true,
});

/** 14 top-level groups (handoff §20) — fixed order. */
export const INDUSTRY_GROUPS: readonly Industry[] = [
  G("IND-HEALTH", "สุขภาพและความงาม"),
  G("IND-RETAIL", "ค้าปลีกและสินค้าอุปโภคบริโภค"),
  G("IND-FNB", "อาหารและเครื่องดื่ม"),
  G("IND-HOTEL", "โรงแรมและการท่องเที่ยว"),
  G("IND-BIZSERVICE", "บริการธุรกิจ"),
  G("IND-TECH", "เทคโนโลยี"),
  G("IND-FINANCE", "การเงินและประกัน"),
  G("IND-REALESTATE", "อสังหาริมทรัพย์และก่อสร้าง"),
  G("IND-MANUFACT", "การผลิตและอุตสาหกรรม"),
  G("IND-LOGISTICS", "โลจิสติกส์และขนส่ง"),
  G("IND-EDU", "การศึกษา"),
  G("IND-GOV", "หน่วยงานรัฐและองค์กร"),
  G("IND-AUTO", "ยานยนต์"),
  G("IND-MEDIA", "สื่อ บันเทิง และกีฬา"),
];

/** Seed sub-industries — teams extend via master data, not code. */
export const SUB_INDUSTRIES: readonly Industry[] = [
  S("IND-HEALTH-HOSPITAL", "IND-HEALTH", "โรงพยาบาล"),
  S("IND-HEALTH-CLINIC", "IND-HEALTH", "คลินิก"),
  S("IND-HEALTH-DENTAL", "IND-HEALTH", "คลินิกทันตกรรม"),
  S("IND-HEALTH-BEAUTY", "IND-HEALTH", "คลินิกความงาม"),
  S("IND-HEALTH-WELLNESS", "IND-HEALTH", "เวลเนส / สปา"),
  S("IND-HEALTH-PHARMACY", "IND-HEALTH", "ร้านขายยา"),
  S("IND-RETAIL-FASHION", "IND-RETAIL", "แฟชั่นและเครื่องแต่งกาย"),
  S("IND-RETAIL-GROCERY", "IND-RETAIL", "ซูเปอร์มาร์เก็ต / ของชำ"),
  S("IND-RETAIL-SPORTS", "IND-RETAIL", "สินค้ากีฬา"),
  S("IND-RETAIL-LIFESTYLE", "IND-RETAIL", "สินค้าไลฟ์สไตล์"),
  S("IND-FNB-RESTAURANT", "IND-FNB", "ร้านอาหาร"),
  S("IND-FNB-CAFE", "IND-FNB", "คาเฟ่ / ร้านกาแฟ"),
  S("IND-FNB-BAKERY", "IND-FNB", "เบเกอรี่"),
  S("IND-FNB-BEVERAGE", "IND-FNB", "เครื่องดื่ม"),
  S("IND-HOTEL-HOTEL", "IND-HOTEL", "โรงแรมและที่พัก"),
  S("IND-HOTEL-TOURISM", "IND-HOTEL", "ท่องเที่ยวและทัวร์"),
  S("IND-BIZSERVICE-CREATIVE", "IND-BIZSERVICE", "ครีเอทีฟ / ดีไซน์"),
  S("IND-BIZSERVICE-CONSULT", "IND-BIZSERVICE", "ที่ปรึกษาธุรกิจ"),
  S("IND-BIZSERVICE-LEGAL", "IND-BIZSERVICE", "บัญชีและกฎหมาย"),
  S("IND-TECH-SOFTWARE", "IND-TECH", "ซอฟต์แวร์"),
  S("IND-TECH-ITSERVICE", "IND-TECH", "บริการไอที"),
  S("IND-TECH-STARTUP", "IND-TECH", "สตาร์ทอัพ"),
  S("IND-MEDIA-FITNESS", "IND-MEDIA", "ฟิตเนสและกีฬา"),
  S("IND-MEDIA-ENTERTAIN", "IND-MEDIA", "สื่อและบันเทิง"),
];

export const INDUSTRIES: readonly Industry[] = [
  ...INDUSTRY_GROUPS,
  ...SUB_INDUSTRIES,
];

export const industryById: ReadonlyMap<IndustryId, Industry> = new Map(
  INDUSTRIES.map((i) => [i.id, i]),
);

/** Migration sentinel for legacy rows (0010 backfill). NEVER selectable and
 * NEVER satisfies the activation gate for newly created Projects. */
export const UNSPECIFIED_PROJECT_TYPE_ID: ProjectTypeId = "PT-UNSPECIFIED";

export const PROJECT_TYPES: readonly ProjectType[] = [
  { id: "PT-NEW-BRANCH", nameTh: "เปิดสาขาใหม่", selectable: true, active: true },
  { id: "PT-REBRAND", nameTh: "รีแบรนด์", selectable: true, active: true },
  { id: "PT-ONBOARD-KIT", nameTh: "Onboarding / Welcome Kit", selectable: true, active: true },
  { id: "PT-SEASONAL", nameTh: "Seasonal / Festival Campaign", selectable: true, active: true },
  { id: "PT-LAUNCH-EVENT", nameTh: "Launch Event", selectable: true, active: true },
  { id: "PT-CORP-GIFT", nameTh: "Corporate Gifting", selectable: true, active: true },
  { id: "PT-UNIFORM", nameTh: "Uniform Program", selectable: true, active: true },
  { id: "PT-LOYALTY", nameTh: "Loyalty / Repeat Program", selectable: true, active: true },
  { id: UNSPECIFIED_PROJECT_TYPE_ID, nameTh: "ไม่ระบุ (ข้อมูลเก่า)", selectable: false, active: true },
];

export const projectTypeById: ReadonlyMap<ProjectTypeId, ProjectType> = new Map(
  PROJECT_TYPES.map((p) => [p.id, p]),
);

/** A project type a user may pick for a NEW Project (reviewer decision #4:
 * UNSPECIFIED is a legacy sentinel only). */
export function isSelectableProjectType(id: ProjectTypeId): boolean {
  const pt = projectTypeById.get(id);
  return pt !== undefined && pt.active && pt.selectable;
}

/**
 * Legacy free-text `accounts.industry` → industry master id.
 * Used by migration 0009's backfill UPDATEs and the seed generator alike
 * (drift test keeps both in sync). Unknown values stay NULL.
 */
export const LEGACY_INDUSTRY_MAP: Readonly<Record<string, IndustryId>> = {
  "Clinic / Healthcare": "IND-HEALTH-CLINIC",
  "Beauty / Clinic": "IND-HEALTH-BEAUTY",
  "Wellness / Hospitality": "IND-HEALTH-WELLNESS",
  "F&B / Cafe": "IND-FNB-CAFE",
  "F&B / Bakery": "IND-FNB-BAKERY",
  "F&B / Restaurant": "IND-FNB-RESTAURANT",
  "Retail / Fashion": "IND-RETAIL-FASHION",
  "Retail / Grocery": "IND-RETAIL-GROCERY",
  "Retail / Sports": "IND-RETAIL-SPORTS",
  "Tech / Software": "IND-TECH-SOFTWARE",
  "Tech / IT Service": "IND-TECH-ITSERVICE",
  "Creative / Design": "IND-BIZSERVICE-CREATIVE",
  "Professional Service": "IND-BIZSERVICE",
  Education: "IND-EDU",
  Fitness: "IND-MEDIA-FITNESS",
  Logistics: "IND-LOGISTICS",
  Tourism: "IND-HOTEL-TOURISM",
};
