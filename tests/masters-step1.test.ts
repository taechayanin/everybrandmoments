import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  INDUSTRIES,
  INDUSTRY_GROUPS,
  LEGACY_INDUSTRY_MAP,
  PROJECT_TYPES,
  SUB_INDUSTRIES,
  UNSPECIFIED_PROJECT_TYPE_ID,
  industryById,
  isSelectableProjectType,
  projectTypeById,
} from "@/lib/domain/industry";
import { MASTER_MOMENTS, THAI_MOMENT_NAMES } from "@/lib/domain/master-moments";
import { MOMENT_CODES } from "@/lib/domain/moment";
import { ACCOUNTS } from "@/lib/infrastructure/mock/accounts";
import { createMockRepositories } from "@/lib/infrastructure/mock/repositories";

// Project Pipeline Step 1 — Thai master data. The domain constants are the
// canonical source; drift tests below pin migration 0009 and the generated
// seed to them so SQL and code cannot diverge silently.

const MIGRATION = readFileSync(
  join(__dirname, "../migrations/0009_thai_masters.sql"),
  "utf-8",
);
const SEED = readFileSync(join(__dirname, "../seed/seed.sql"), "utf-8");

describe("industry master", () => {
  it("is unique: group names globally, sub names within their group, ids overall", () => {
    const ids = INDUSTRIES.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);

    const groupNames = INDUSTRY_GROUPS.map((g) => g.nameTh);
    expect(new Set(groupNames).size).toBe(groupNames.length);

    const subKeys = SUB_INDUSTRIES.map((s) => `${s.parentId}|${s.nameTh}`);
    expect(new Set(subKeys).size).toBe(subKeys.length);
  });

  it("has exactly the 14 approved top-level groups", () => {
    expect(INDUSTRY_GROUPS).toHaveLength(14);
    for (const g of INDUSTRY_GROUPS) expect(g.parentId).toBeNull();
  });

  it("every sub-industry belongs to an existing top-level group", () => {
    for (const s of SUB_INDUSTRIES) {
      expect(s.parentId).not.toBeNull();
      const parent = industryById.get(s.parentId!);
      expect(parent, `${s.id} parent missing`).toBeDefined();
      // Exactly one level deep — a sub's parent is always a group.
      expect(parent!.parentId).toBeNull();
    }
  });
});

describe("project type master", () => {
  it("is unique by id and by Thai name", () => {
    const ids = PROJECT_TYPES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = PROJECT_TYPES.map((p) => p.nameTh);
    expect(new Set(names).size).toBe(names.length);
  });

  it("UNSPECIFIED is a legacy sentinel — never selectable for new Projects", () => {
    const sentinel = projectTypeById.get(UNSPECIFIED_PROJECT_TYPE_ID);
    expect(sentinel).toBeDefined();
    expect(sentinel!.selectable).toBe(false);
    expect(isSelectableProjectType(UNSPECIFIED_PROJECT_TYPE_ID)).toBe(false);
    // Every other seeded type IS selectable.
    for (const p of PROJECT_TYPES) {
      if (p.id !== UNSPECIFIED_PROJECT_TYPE_ID) {
        expect(isSelectableProjectType(p.id)).toBe(true);
      }
    }
  });

  it("repository listSelectable excludes the sentinel (mock = executable spec)", async () => {
    const repos = createMockRepositories();
    const selectable = await repos.projectTypes.listSelectable();
    expect(selectable.length).toBe(PROJECT_TYPES.length - 1);
    expect(selectable.some((p) => p.id === UNSPECIFIED_PROJECT_TYPE_ID)).toBe(false);
    // listAll still exposes it (legacy rows must render a label).
    const all = await repos.projectTypes.listAll();
    expect(all.some((p) => p.id === UNSPECIFIED_PROJECT_TYPE_ID)).toBe(true);
  });
});

describe("Thai moment names", () => {
  it("map 1:1 onto the existing 20 moment codes — codes unchanged", () => {
    expect(MOMENT_CODES).toHaveLength(20);
    expect(Object.keys(THAI_MOMENT_NAMES).sort()).toEqual([...MOMENT_CODES].sort());
    for (const m of MASTER_MOMENTS) {
      expect(m.thaiName).toBe(THAI_MOMENT_NAMES[m.code]);
      expect(m.thaiName.length).toBeGreaterThan(0);
    }
    const names = Object.values(THAI_MOMENT_NAMES);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("master repositories (org/master semantics)", () => {
  it("industries listAll returns groups before subs; getById resolves both", async () => {
    const repos = createMockRepositories();
    const all = await repos.industries.listAll();
    expect(all).toHaveLength(INDUSTRIES.length);
    const firstSubIndex = all.findIndex((i) => i.parentId !== null);
    const lastGroupIndex = all.map((i) => i.parentId === null).lastIndexOf(true);
    expect(firstSubIndex).toBeGreaterThan(-1);
    expect(lastGroupIndex).toBeLessThan(firstSubIndex + SUB_INDUSTRIES.length);
    expect((await repos.industries.getById("IND-HEALTH"))?.nameTh).toBe("สุขภาพและความงาม");
    expect((await repos.industries.getById("IND-HEALTH-CLINIC"))?.parentId).toBe("IND-HEALTH");
    expect(await repos.industries.getById("IND-NOPE")).toBeNull();
  });

  it("mock accounts carry industryId derived from the same legacy map as 0009", () => {
    for (const a of ACCOUNTS) {
      expect(a.industryId).toBe(LEGACY_INDUSTRY_MAP[a.industry] ?? null);
      if (a.industryId) expect(industryById.has(a.industryId)).toBe(true);
    }
    // Current demo dataset maps completely — no unmapped legacy label.
    expect(ACCOUNTS.every((a) => a.industryId !== null)).toBe(true);
  });

  it("every legacy-map target exists in the industry master", () => {
    for (const id of Object.values(LEGACY_INDUSTRY_MAP)) {
      expect(industryById.has(id), `${id} missing from master`).toBe(true);
    }
  });
});

describe("migration 0009 drift (SQL pinned to domain constants)", () => {
  it("inserts exactly the domain industries", () => {
    const inserts = MIGRATION.match(/INSERT INTO industries [^;]+;/g) ?? [];
    expect(inserts).toHaveLength(INDUSTRIES.length);
    for (const i of INDUSTRIES) {
      const parent = i.parentId ? `'${i.parentId}'` : "NULL";
      expect(MIGRATION).toContain(
        `INSERT INTO industries (id, name_th, parent_id, active) VALUES ('${i.id}', '${i.nameTh}', ${parent}, 1);`,
      );
    }
  });

  it("inserts exactly the domain project types with selectable flags", () => {
    const inserts = MIGRATION.match(/INSERT INTO project_types [^;]+;/g) ?? [];
    expect(inserts).toHaveLength(PROJECT_TYPES.length);
    for (const p of PROJECT_TYPES) {
      expect(MIGRATION).toContain(
        `INSERT INTO project_types (id, name_th, selectable, active) VALUES ('${p.id}', '${p.nameTh}', ${p.selectable ? 1 : 0}, 1);`,
      );
    }
  });

  it("backfills every Thai moment name and every legacy industry mapping", () => {
    for (const [code, name] of Object.entries(THAI_MOMENT_NAMES)) {
      expect(MIGRATION).toContain(
        `UPDATE master_moments SET thai_name = '${name}' WHERE code = '${code}';`,
      );
    }
    for (const [legacy, id] of Object.entries(LEGACY_INDUSTRY_MAP)) {
      expect(MIGRATION).toContain(
        `UPDATE accounts SET industry_id = '${id}' WHERE industry = '${legacy.replace(/'/g, "''")}';`,
      );
    }
  });

  it("declares the uniqueness and FK constraints for the masters", () => {
    expect(MIGRATION).toContain(
      "CREATE UNIQUE INDEX uq_industries_group_name ON industries(name_th) WHERE parent_id IS NULL;",
    );
    expect(MIGRATION).toContain(
      "CREATE UNIQUE INDEX uq_industries_sub_name ON industries(parent_id, name_th) WHERE parent_id IS NOT NULL;",
    );
    expect(MIGRATION).toContain("CREATE UNIQUE INDEX uq_project_types_name ON project_types(name_th);");
    expect(MIGRATION).toContain("parent_id TEXT REFERENCES industries(id)");
    expect(MIGRATION).toContain("ALTER TABLE accounts ADD COLUMN industry_id TEXT REFERENCES industries(id);");
  });
});

describe("deterministic seed", () => {
  it("clears masters before re-inserting them — rerun cannot duplicate", () => {
    // DELETEs precede INSERTs, and accounts (FK holder) clears first.
    const delAccounts = SEED.indexOf("DELETE FROM accounts;");
    const delIndustries = SEED.indexOf("DELETE FROM industries;");
    const delTypes = SEED.indexOf("DELETE FROM project_types;");
    const firstInsert = SEED.indexOf("INSERT INTO");
    expect(delAccounts).toBeGreaterThan(-1);
    expect(delIndustries).toBeGreaterThan(delAccounts);
    expect(delTypes).toBeGreaterThan(-1);
    expect(firstInsert).toBeGreaterThan(delIndustries);
    // Seed carries exactly one row per master entry.
    expect(SEED.match(/INSERT INTO industries /g)).toHaveLength(INDUSTRIES.length);
    expect(SEED.match(/INSERT INTO project_types /g)).toHaveLength(PROJECT_TYPES.length);
    // Every account row seeds industry_id via the same legacy map.
    expect(SEED.match(/INSERT INTO accounts /g)).toHaveLength(ACCOUNTS.length);
    expect(SEED).toContain("'ACC-001', 'ORG-001', 'ABC Clinic', 'Clinic / Healthcare', 'IND-HEALTH-CLINIC'");
  });
});
