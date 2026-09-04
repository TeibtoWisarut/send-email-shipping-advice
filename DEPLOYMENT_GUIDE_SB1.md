# 🧪 SB1 Deployment Guide
## SA Auto-Email on Confirm — Double A NetSuite (Sandbox 1)

**Date Prepared:** 2026-06-11
**Source of truth:** `SL Shipping Advice Export (Modified).js` (รวมแก้ล่าสุด: PI No., Closing Date/Time, Grade fix)
**Target Environment:** SB1 (account `________` ← เติม account id ของ SB1)
**Affected Script:** `customscript_sl_shipping_advice_export`
**Tested already in:** SB2 (`8158655_SB2`) ✅

> 📌 **SB1 ≠ Production** — นี่คือ sandbox อีกตัว ใช้เทสต์/staging ก่อนขึ้น prod
> Internal ID ใน SB1 อาจไม่ตรงกับ SB2 หรือ Production — ต้อง verify ทุกครั้ง

---

## 📋 PHASE 1 — Pre-Deploy Setup ใน SB1

### 1.1 Custom Fields ของ Email Feature (3 fields)

ตรวจก่อนว่า SB1 มีครบไหม — ถ้า SB1 refresh มาจาก prod เก่า/ก่อนสร้าง field พวกนี้ จะยังไม่มี ต้องสร้างใหม่

| # | Field ID | Type | Apply To | Display Type | Notes |
|---|----------|------|----------|--------------|-------|
| 1 | `custbody_sa_email_sent` | **Check Box** | Transaction Body (Sale) | **Disabled** | กันส่ง email ซ้ำ |
| 2 | `custbody_sa_email_sent_date` | **Date/Time** | Transaction Body (Sale) | **Disabled** | Audit trail |
| 3 | `custentity_receive_email` | **Check Box** | Entity (Employee) | **Normal** | Opt-in recipient |

วิธีสร้าง (ถ้ายังไม่มี):
```
custbody_sa_email_sent
  Path: Customization → Lists, Records & Fields → Transaction Body Fields → New
  ID: custbody_sa_email_sent | Label: SA Email Sent | Type: Check Box
  Applies To: Sale | Store Value: ✅ | Show In List: ✅ | Display Type: Disabled

custbody_sa_email_sent_date
  Path: Transaction Body Fields → New
  ID: custbody_sa_email_sent_date | Label: SA Email Sent Date | Type: Date/Time
  Applies To: Sale | Store Value: ✅ | Display Type: Disabled

custentity_receive_email
  Path: Entity Fields → New
  ID: custentity_receive_email | Label: Receive Email | Type: Check Box
  Applies To: Employee | Store Value: ✅ | Display Type: Normal
```

> ⚠️ Field IDs ต้องตรงเป๊ะ — script อ้างชื่อ ID ตรงๆ

### 1.2 Header Fields ที่เพิ่มในอีเมล (เช็คว่ามีอยู่แล้ว — ไม่ต้องสร้าง)

3 field นี้เป็นส่วนหนึ่งของ workflow SA Export อยู่แล้ว (script set ค่าตอนสร้าง SA) — แค่**ยืนยันว่ามีใน SB1**:

| Field ID | ใช้แสดงเป็น | ปกติมีอยู่แล้วถ้า SA Export ทำงานใน SB1 |
|----------|-------------|------------------------------------------|
| `custbody_ex_ref_pi` | PI No. | ✅ (field อ้าง Proforma Invoice) |
| `custbody_ex_closing_date` | Closing Date | ✅ |
| `custbody_ex_closing_time` | Closing Time | ✅ |

→ ถ้าหน้า SA Export ใน SB1 ใช้งานได้ปกติ = มีครบแน่นอน ไม่ต้องทำอะไร

### 1.3 Grade — Custom Segment บน Item Record (เช็คว่ามี)

Grade fix ล่าสุดอ่านจาก **item record** ผ่าน field id `cseg_item_grade`
```
เช็ค: เปิด Item record ตัวอย่าง → ดูว่ามี field "Grade" (cseg_item_grade) ที่มีค่า
```
> ⚠️ ถ้า field id ของ Grade segment บน item record ใน SB1 ไม่ใช่ `cseg_item_grade` → Grade จะว่าง ต้องแจ้ง dev แก้ id ในสคริปต์ (ฟังก์ชัน `getEmailData` → `search.lookupFields` columns)

### 1.4 Employee Setup
```
Mark recipients:
  Lists → Employees → Employees → เปิด record → check ☑ "Receive Email" → Save
  (แนะนำ mark 2-3 คน; ใน sandbox ควรใช้ email ของทีม dev/tester เพื่อกัน spam ลูกค้าจริง)

Verify Sender Employee:
  Lists → Employees → Employees → ค้นหา OH Team (oh_team@doublea1991.com)
  → จด Internal ID → เทียบกับ SENDER_EMPLOYEE_ID ในสคริปต์ (ปัจจุบัน = 100856)
```
> ⚠️ ถ้า OH Team ใน SB1 ไม่ใช่ Internal ID 100856 → แก้ `SENDER_EMPLOYEE_ID` ใน module `ShippingAdviceEmailModule` ก่อน upload

### 1.5 File Path
```
เช็ค: Documents → Files → File Cabinet
      → SuiteScripts → EXP → Shipping Advice Export → SL Shipping Advice Export.js
ไม่มี → สร้าง folder ก่อน | มี → จะ replace ทับ
```

---

## 📋 PHASE 2 — Deploy Script

### 2.1 Backup ไฟล์ปัจจุบันของ SB1 ก่อน (สำคัญ)
```
File Cabinet → SL Shipping Advice Export.js → Download
→ เก็บไว้ที่ project folder: "Backup Script SB1/SL Shipping Advice Export.js"
```

### 2.2 Upload
```
Documents → Files → File Cabinet → SuiteScripts → EXP → Shipping Advice Export
→ เปิด "SL Shipping Advice Export.js" → Edit
→ ATTACH FROM: Computer
→ Choose File: "SL Shipping Advice Export (Modified).js" จากเครื่อง
→ NAME: ตัด "(Modified)" ออก → "SL Shipping Advice Export.js"
→ Save
```

### 2.3 Verify Upload
```
Customization → Scripting → Scripts → SL Shipping Advice Export → preview file
ค้นหาต้องเจอ:
  ☑ "ShippingAdviceEmailModule"
  ☑ "Shipping Advice Confirmed : "
  ☑ "PI No."          ← field ใหม่
  ☑ "Closing Date"    ← field ใหม่
  ☑ "cseg_item_grade" ← Grade fix
ดู Modified Date = วันที่ upload
```

---

## 📋 PHASE 3 — Smoke Test ใน SB1

### 3.1 Prerequisites
- ☐ Custom Fields 3 ตัว (email feature) มีครบ
- ☐ Header fields (PI/Closing Date/Time) มีค่าบน SA ตัวที่จะเทสต์
- ☐ Employee อย่างน้อย 1 คน check `custentity_receive_email = T` (ใช้ email ทีม)
- ☐ Sender Employee active + มี email
- ☐ Browser cache cleared (Cmd+Shift+R)

### 3.2 Test Flow
1. หา/สร้าง Sales Order Draft SA (`custbody_is_shippingadvice = T`, status = Draft SA, ยังไม่มี FOB Price)
2. คลิก **Confirm Shipping Advice** → dialog ให้ใส่ FOB → OK → หน้า FOB Price
3. คำนวณ FOB → Submit → กลับมา SA
4. **Refresh** (Cmd+Shift+R)
5. คลิก **Confirm Shipping Advice** อีกครั้ง → "Would you like to Confirm?" → OK
6. รอ redirect กลับ SA

### 3.3 Verification Points

| Verify | Where | Expected (SB1) |
|--------|-------|----------------|
| SA Status | field "Status" | **Confirmed** |
| Email Sent Flag | `custbody_sa_email_sent` | ☑ Checked |
| Email Sent Date | `custbody_sa_email_sent_date` | วันเวลาปัจจุบัน |
| Email ถึง inbox | recipient ที่ check flag | ได้รับ HTML email |
| **Subject** | email | `[SANDBOX] Shipping Advice Confirmed : SAE-...` พร้อม suffix `(originally To: ...)` ← **ปกติของ sandbox** |
| **PI No.** | ตาราง header ในอีเมล | แสดงเลข PI ต่อจาก Shipping Advice No. |
| **Closing Date / Time** | header (ก่อน VGM Cut-Off) | แสดงค่า ถ้า SA มีข้อมูล |
| **Grade** | คอลัมน์ในตาราง item | **แสดงค่า (ไม่ว่าง)** ← จุดที่เพิ่งแก้ |
| Gram / Brand / Paper Size | คอลัมน์ item | แสดงครบ |
| Communication Tab | บน SA | มี Message ใหม่ |
| Execution Log | Script → Execution Log | "SA Email | Sent OK..." |

> 🔎 **SB1 sandbox จะมี `[SANDBOX]` prefix + `(originally To:...)` suffix ใน subject อัตโนมัติ — นี่ถูกต้อง ไม่ใช่บั๊ก** (NetSuite บังคับใน sandbox; ใน prod จะหายไปเอง)

---

## 📋 PHASE 4 — Rollback

```
ถ้าพัง:
1. File Cabinet → SL Shipping Advice Export.js → Revision History → Restore version ก่อนหน้า
   หรือ
2. Upload backup จาก "Backup Script SB1/" ทับ

หยุด email ชั่วคราวโดยไม่ rollback:
- Mark ทุก Employee custentity_receive_email = F → recipients = 0 → skip email
  (status update ยังทำงานปกติ)
```

---

## 📋 PHASE 5 — เมื่อเทสต์ SB1 ผ่าน → เตรียมขึ้น Production

เมื่อ SB1 PASS ครบ:
- [ ] Sync การแก้กลับเข้า `DEPLOYMENT_GUIDE.md` (prod) — เพิ่ม fields ใหม่ในขั้น verify ของ prod ด้วย (PI No. / Closing Date / Closing Time / Grade)
- [ ] ยืนยัน Sender Employee ID ที่ถูกต้องของ Production
- [ ] ทำตาม `DEPLOYMENT_GUIDE.md` Phase 1-5

---

## 🔖 Quick Reference: Internal IDs

| Item | SB2 | SB1 | Production |
|------|-----|-----|------------|
| Confirm SA Suitelet (`customscript_sl_shipping_advice_export`) | 2453 | ? (เติม) | ? |
| FOB Price Suitelet (`customscript_sl_fob_price`) | 2144 | ? | ? |
| Sender Employee (OH Team) | 100856 | ? **ต้อง verify** | ? ต้อง verify |

> Script ใช้ `customscript_*` (Text ID) → ข้าม environment ได้
> แต่ `SENDER_EMPLOYEE_ID = 100856` hard-code เป็นตัวเลข → **ต้อง verify ทุก env**

---

## ✅ SB1 Sign-off
- [ ] Phase 1 — Setup (3 email fields + verify header fields + Grade segment + employees)
- [ ] Phase 2 — Backup เดิม + Upload script ใหม่
- [ ] Phase 3 — Smoke test PASS (เน้นเช็ค PI No. / Closing Date-Time / **Grade**)
- [ ] Phase 4 — รู้ rollback plan
- [ ] เติม Internal IDs ของ SB1 ในตารางด้านบน
