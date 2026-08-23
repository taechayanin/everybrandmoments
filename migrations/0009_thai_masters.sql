-- 0009: Thai master data (Project Pipeline Step 1, plan §2).
-- Forward-only. Canonical values live in lib/domain/industry.ts and
-- lib/domain/master-moments.ts; tests/masters-step1.test.ts pins this file
-- to those constants (drift test).

-- 1) Industry master — 14 top-level groups + seed sub-industries.
CREATE TABLE industries (
  id TEXT PRIMARY KEY,
  name_th TEXT NOT NULL,
  parent_id TEXT REFERENCES industries(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);
-- Uniqueness: group names globally, sub names within their group.
CREATE UNIQUE INDEX uq_industries_group_name ON industries(name_th) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX uq_industries_sub_name ON industries(parent_id, name_th) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_industries_parent ON industries(parent_id);

INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-HEALTH', 'สุขภาพและความงาม', NULL, 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-RETAIL', 'ค้าปลีกและสินค้าอุปโภคบริโภค', NULL, 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-FNB', 'อาหารและเครื่องดื่ม', NULL, 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-HOTEL', 'โรงแรมและการท่องเที่ยว', NULL, 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-BIZSERVICE', 'บริการธุรกิจ', NULL, 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-TECH', 'เทคโนโลยี', NULL, 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-FINANCE', 'การเงินและประกัน', NULL, 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-REALESTATE', 'อสังหาริมทรัพย์และก่อสร้าง', NULL, 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-MANUFACT', 'การผลิตและอุตสาหกรรม', NULL, 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-LOGISTICS', 'โลจิสติกส์และขนส่ง', NULL, 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-EDU', 'การศึกษา', NULL, 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-GOV', 'หน่วยงานรัฐและองค์กร', NULL, 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-AUTO', 'ยานยนต์', NULL, 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-MEDIA', 'สื่อ บันเทิง และกีฬา', NULL, 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-HEALTH-HOSPITAL', 'โรงพยาบาล', 'IND-HEALTH', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-HEALTH-CLINIC', 'คลินิก', 'IND-HEALTH', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-HEALTH-DENTAL', 'คลินิกทันตกรรม', 'IND-HEALTH', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-HEALTH-BEAUTY', 'คลินิกความงาม', 'IND-HEALTH', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-HEALTH-WELLNESS', 'เวลเนส / สปา', 'IND-HEALTH', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-HEALTH-PHARMACY', 'ร้านขายยา', 'IND-HEALTH', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-RETAIL-FASHION', 'แฟชั่นและเครื่องแต่งกาย', 'IND-RETAIL', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-RETAIL-GROCERY', 'ซูเปอร์มาร์เก็ต / ของชำ', 'IND-RETAIL', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-RETAIL-SPORTS', 'สินค้ากีฬา', 'IND-RETAIL', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-RETAIL-LIFESTYLE', 'สินค้าไลฟ์สไตล์', 'IND-RETAIL', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-FNB-RESTAURANT', 'ร้านอาหาร', 'IND-FNB', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-FNB-CAFE', 'คาเฟ่ / ร้านกาแฟ', 'IND-FNB', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-FNB-BAKERY', 'เบเกอรี่', 'IND-FNB', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-FNB-BEVERAGE', 'เครื่องดื่ม', 'IND-FNB', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-HOTEL-HOTEL', 'โรงแรมและที่พัก', 'IND-HOTEL', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-HOTEL-TOURISM', 'ท่องเที่ยวและทัวร์', 'IND-HOTEL', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-BIZSERVICE-CREATIVE', 'ครีเอทีฟ / ดีไซน์', 'IND-BIZSERVICE', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-BIZSERVICE-CONSULT', 'ที่ปรึกษาธุรกิจ', 'IND-BIZSERVICE', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-BIZSERVICE-LEGAL', 'บัญชีและกฎหมาย', 'IND-BIZSERVICE', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-TECH-SOFTWARE', 'ซอฟต์แวร์', 'IND-TECH', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-TECH-ITSERVICE', 'บริการไอที', 'IND-TECH', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-TECH-STARTUP', 'สตาร์ทอัพ', 'IND-TECH', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-MEDIA-FITNESS', 'ฟิตเนสและกีฬา', 'IND-MEDIA', 1);
INSERT INTO industries (id, name_th, parent_id, active) VALUES ('IND-MEDIA-ENTERTAIN', 'สื่อและบันเทิง', 'IND-MEDIA', 1);

-- 2) Controlled project-type master. selectable=0 marks legacy sentinels
--    (PT-UNSPECIFIED) that can never be chosen for a new Project.
CREATE TABLE project_types (
  id TEXT PRIMARY KEY,
  name_th TEXT NOT NULL,
  selectable INTEGER NOT NULL DEFAULT 1 CHECK (selectable IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);
CREATE UNIQUE INDEX uq_project_types_name ON project_types(name_th);

INSERT INTO project_types (id, name_th, selectable, active) VALUES ('PT-NEW-BRANCH', 'เปิดสาขาใหม่', 1, 1);
INSERT INTO project_types (id, name_th, selectable, active) VALUES ('PT-REBRAND', 'รีแบรนด์', 1, 1);
INSERT INTO project_types (id, name_th, selectable, active) VALUES ('PT-ONBOARD-KIT', 'Onboarding / Welcome Kit', 1, 1);
INSERT INTO project_types (id, name_th, selectable, active) VALUES ('PT-SEASONAL', 'Seasonal / Festival Campaign', 1, 1);
INSERT INTO project_types (id, name_th, selectable, active) VALUES ('PT-LAUNCH-EVENT', 'Launch Event', 1, 1);
INSERT INTO project_types (id, name_th, selectable, active) VALUES ('PT-CORP-GIFT', 'Corporate Gifting', 1, 1);
INSERT INTO project_types (id, name_th, selectable, active) VALUES ('PT-UNIFORM', 'Uniform Program', 1, 1);
INSERT INTO project_types (id, name_th, selectable, active) VALUES ('PT-LOYALTY', 'Loyalty / Repeat Program', 1, 1);
INSERT INTO project_types (id, name_th, selectable, active) VALUES ('PT-UNSPECIFIED', 'ไม่ระบุ (ข้อมูลเก่า)', 0, 1);

-- 3) Official Thai names for the existing 20 Business Moments.
--    Codes stay unchanged (FK/data anchored).
ALTER TABLE master_moments ADD COLUMN thai_name TEXT;
UPDATE master_moments SET thai_name = 'เริ่มต้นธุรกิจ' WHERE code = 'EBM Start';
UPDATE master_moments SET thai_name = 'สร้างแบรนด์' WHERE code = 'EBM Build';
UPDATE master_moments SET thai_name = 'รับคนใหม่' WHERE code = 'EBM Hire';
UPDATE master_moments SET thai_name = 'ต้อนรับ' WHERE code = 'EBM Welcome';
UPDATE master_moments SET thai_name = 'เปิดตัว' WHERE code = 'EBM Launch';
UPDATE master_moments SET thai_name = 'กระตุ้นยอดขาย' WHERE code = 'EBM Sell';
UPDATE master_moments SET thai_name = 'ส่งมอบ' WHERE code = 'EBM Deliver';
UPDATE master_moments SET thai_name = 'ขอบคุณ' WHERE code = 'EBM Thanks';
UPDATE master_moments SET thai_name = 'ซื้อซ้ำ / ใช้ซ้ำ' WHERE code = 'EBM Repeat';
UPDATE master_moments SET thai_name = 'สร้างความผูกพัน' WHERE code = 'EBM Engage';
UPDATE master_moments SET thai_name = 'เติบโต' WHERE code = 'EBM Grow';
UPDATE master_moments SET thai_name = 'ก้าวสำคัญ' WHERE code = 'EBM Milestone';
UPDATE master_moments SET thai_name = 'เฉลิมฉลอง' WHERE code = 'EBM Celebrate';
UPDATE master_moments SET thai_name = 'เทศกาลและโอกาสพิเศษ' WHERE code = 'EBM Season';
UPDATE master_moments SET thai_name = 'ขยายธุรกิจ' WHERE code = 'EBM Expand';
UPDATE master_moments SET thai_name = 'เปลี่ยนแปลง' WHERE code = 'EBM Change';
UPDATE master_moments SET thai_name = 'กู้ความเชื่อมั่น' WHERE code = 'EBM Recover';
UPDATE master_moments SET thai_name = 'ดึงกลับมา' WHERE code = 'EBM Return';
UPDATE master_moments SET thai_name = 'อำลา' WHERE code = 'EBM Farewell';
UPDATE master_moments SET thai_name = 'ปิดหรือส่งต่อธุรกิจ' WHERE code = 'EBM Close';

-- 4) accounts.industry_id — master reference backfilled from the legacy
--    free-text label. Unmapped values stay NULL (reported per step packet).
ALTER TABLE accounts ADD COLUMN industry_id TEXT REFERENCES industries(id);
UPDATE accounts SET industry_id = 'IND-HEALTH-CLINIC' WHERE industry = 'Clinic / Healthcare';
UPDATE accounts SET industry_id = 'IND-HEALTH-BEAUTY' WHERE industry = 'Beauty / Clinic';
UPDATE accounts SET industry_id = 'IND-HEALTH-WELLNESS' WHERE industry = 'Wellness / Hospitality';
UPDATE accounts SET industry_id = 'IND-FNB-CAFE' WHERE industry = 'F&B / Cafe';
UPDATE accounts SET industry_id = 'IND-FNB-BAKERY' WHERE industry = 'F&B / Bakery';
UPDATE accounts SET industry_id = 'IND-FNB-RESTAURANT' WHERE industry = 'F&B / Restaurant';
UPDATE accounts SET industry_id = 'IND-RETAIL-FASHION' WHERE industry = 'Retail / Fashion';
UPDATE accounts SET industry_id = 'IND-RETAIL-GROCERY' WHERE industry = 'Retail / Grocery';
UPDATE accounts SET industry_id = 'IND-RETAIL-SPORTS' WHERE industry = 'Retail / Sports';
UPDATE accounts SET industry_id = 'IND-TECH-SOFTWARE' WHERE industry = 'Tech / Software';
UPDATE accounts SET industry_id = 'IND-TECH-ITSERVICE' WHERE industry = 'Tech / IT Service';
UPDATE accounts SET industry_id = 'IND-BIZSERVICE-CREATIVE' WHERE industry = 'Creative / Design';
UPDATE accounts SET industry_id = 'IND-BIZSERVICE' WHERE industry = 'Professional Service';
UPDATE accounts SET industry_id = 'IND-EDU' WHERE industry = 'Education';
UPDATE accounts SET industry_id = 'IND-MEDIA-FITNESS' WHERE industry = 'Fitness';
UPDATE accounts SET industry_id = 'IND-LOGISTICS' WHERE industry = 'Logistics';
UPDATE accounts SET industry_id = 'IND-HOTEL-TOURISM' WHERE industry = 'Tourism';
CREATE INDEX idx_accounts_industry ON accounts(industry_id);
