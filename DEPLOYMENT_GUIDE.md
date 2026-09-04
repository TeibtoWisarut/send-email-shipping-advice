# 🚀 Production Deployment Guide
## SA Auto-Email on Confirm — Double A NetSuite

**Date Prepared:** 2026-05-24
**Sandbox Status:** ✅ Tested OK (SB2 + SB1)
**Production Status:** ✅ **DEPLOYED 2026-06-11** — script file uploaded & verified identical
**Affected Script:** `customscript_sl_shipping_advice_export`

---

## ✅ DEPLOYMENT COMPLETE — 2026-06-11

Production deploy ทำเสร็จแล้วผ่าน SuiteCloud CLI (auth `8158655`):
- Custom Fields, Records, Script Deployment record — **ตั้งไว้ในระบบ Production อยู่แล้ว** (ไม่ต้องสร้างใหม่)
- Deploy แค่ไฟล์ script: `~/FileCabinet/SuiteScripts/EXP/Shipping Advice Export/SL Shipping Advice Export.js`
- Sender Employee ID **100856** (OH Team) — ยืนยันแล้วว่าถูกต้องใน Production
- Backup ไฟล์ prod ก่อน deploy: `Backup Script PROD/SL Shipping Advice Export (PROD pre-deploy 2026-06-11).js`
- Verify: re-import + diff = **identical** ✅

เวอร์ชันที่ deploy รวมการแก้ล่าสุด (2026-06-11):
- **PI No.** (`custbody_ex_ref_pi`) — ตัด prefix "Sales Order #" เหลือเฉพาะเลขเอกสาร
- **Closing Date / Closing Time** (`custbody_ex_closing_date` / `custbody_ex_closing_time`) — แทรกก่อน VGM Cut-Off
- **Closing Time / VGM Cut-Off Time** — แปลงเป็น 24-hour format
- **Grade** (`cseg_item_grade`) — lookup จาก item record (เดิมว่าง)

> ส่วนเนื้อหา Phase 1-5 ด้านล่างเก็บไว้เป็น reference/runbook สำหรับ re-deploy หรือ rollback

---

## 📋 PHASE 1 — Pre-Deploy Setup in Production

### 1.1 Custom Fields ที่ต้องสร้าง (3 fields)

| # | Field ID | Type | Apply To | Display Type | Default | Notes |
|---|----------|------|----------|--------------|---------|-------|
| 1 | `custbody_sa_email_sent` | **Check Box** | **Transaction Body Fields** (Sales Order) | **Disabled** | Unchecked | กันส่ง email ซ้ำ; ห้าม user แก้เอง |
| 2 | `custbody_sa_email_sent_date` | **Date/Time** | **Transaction Body Fields** (Sales Order) | **Disabled** | (blank) | Audit trail timestamp |
| 3 | `custentity_receive_email` | **Check Box** | **Entity Fields** (Employee) | **Normal** | Unchecked | Opt-in flag สำหรับ recipient |

#### 1.1.1 สร้าง `custbody_sa_email_sent`
```
Path:  Customization → Lists, Records & Fields → Transaction Body Fields → New
Settings:
  - ID:            custbody_sa_email_sent  (must match exactly)
  - Label:         SA Email Sent
  - Type:          Check Box
  - Applies To:    Sale (เปิด Sales Order)
  - Store Value:   ✅ Yes
  - Show In List:  ✅ Yes
  - Display Type:  Disabled  ← สำคัญ! ห้ามให้ user แก้
  - Default Value: (blank/false)
  - Subtab:        Custom (หรือเลือกตามที่เหมาะ)
```

#### 1.1.2 สร้าง `custbody_sa_email_sent_date`
```
Path:  Customization → Lists, Records & Fields → Transaction Body Fields → New
Settings:
  - ID:            custbody_sa_email_sent_date  (must match exactly)
  - Label:         SA Email Sent Date
  - Type:          Date/Time
  - Applies To:    Sale
  - Store Value:   ✅ Yes
  - Display Type:  Disabled
  - Subtab:        Custom
```

#### 1.1.3 สร้าง `custentity_receive_email`
```
Path:  Customization → Lists, Records & Fields → Entity Fields → New
Settings:
  - ID:            custentity_receive_email  (must match exactly)
  - Label:         Receive Email
  - Type:          Check Box
  - Applies To:    Employee  ← Important! เฉพาะ Employee
  - Store Value:   ✅ Yes
  - Display Type:  Normal
  - Default Value: (blank/false)
  - Subtab:        Human Resources (หรือตามที่เหมาะ)
```

> ⚠️ **Field IDs must match exactly** — script references field names by exact ID. ห้ามเปลี่ยนชื่อ ID ระหว่างทาง

---

### 1.2 Employee Setup

#### 1.2.1 Mark Recipient Employees
```
Path:  Lists → Employees → Employees
       → เปิด Employee record ของคนที่ต้องการให้ได้รับ email
       → Tab: Human Resources (หรือที่ field ตั้งอยู่)
       → check ☑ "Receive Email"
       → Save
```

**Recommend:** mark อย่างน้อย 2-3 คน เพื่อรองรับการขาด/ลา

#### 1.2.2 Verify Sender Employee (ID 100856)
```
Path:  Lists → Employees → Employees → กด View ที่ Employee ID 100856
       (OH Team / oh_team@doublea1991.com)
       
Check:
  ☑ Status:        Active (ไม่ inactive)
  ☑ Email:         oh_team@doublea1991.com
  ☑ Subsidiary:    มีค่าครบ (ถ้าใช้ multi-subsidiary)
```

⚠️ ถ้า Employee ID 100856 ใน Production ไม่ใช่ OH Team → ต้องหา Internal ID ที่ถูกต้อง แล้วแก้ใน script ที่ `SENDER_EMPLOYEE_ID` (ตอนนี้อยู่ใน module `ShippingAdviceEmailModule` line ~2226)

---

### 1.3 File Path Verification

ก่อน upload เช็คก่อนว่า Production มี folder/file นี้:
```
Path:  Documents → Files → File Cabinet
       → SuiteScripts → EXP → Shipping Advice Export → SL Shipping Advice Export.js
```

→ ถ้าไม่มี → ต้องสร้าง folder ก่อน
→ ถ้ามี → จะ replace ทับด้วยไฟล์ใหม่

---

## 📋 PHASE 2 — Deploy Script

### 2.1 (Optional) Cleanup Debug Logs

ตอนนี้ script มี debug logs เยอะมาก (`SA Email [Step 0]` ถึง `[Step 5]`) — เพื่อความสะอาดของ Execution Log ใน Production ควร:

- **Option A** (Recommended): Cleanup logs ก่อน — บอกผมก่อน deploy
- **Option B**: ปล่อยไว้ตามเดิม — log จะเยอะหน่อยแต่ debug ง่ายถ้าเจอปัญหา

### 2.2 Upload File

```
Path:  Documents → Files → File Cabinet → SuiteScripts → EXP → Shipping Advice Export
       → เปิด file "SL Shipping Advice Export.js" → Edit
       → ATTACH FROM: Computer
       → Choose File: เลือก "SL Shipping Advice Export (Modified).js" จากเครื่อง
       → NAME: เปลี่ยนเป็น "SL Shipping Advice Export.js" (ตัด "(Modified)" ออก)
       → Save
```

### 2.3 Verify Upload สำเร็จ

```
1. กลับไปที่ Customization → Scripting → Scripts → SL Shipping Advice Export
2. คลิก preview script file
3. Search หา "ShippingAdviceEmailModule"  → ต้องเจอ
4. Search หา "Shipping Advice Confirmed : "  → ต้องเจอ
5. ดู Modified Date → เป็นวันที่ upload
```

---

## 📋 PHASE 3 — Smoke Test in Production

### 3.1 Prerequisites Check
- ☐ Custom Fields 3 ตัวสร้างครบ
- ☐ Employee อย่างน้อย 1 คน check `custentity_receive_email = T`
- ☐ Employee 100856 (OH Team) active + มี email
- ☐ File `SL Shipping Advice Export.js` upload แล้ว
- ☐ Browser cache cleared (Cmd+Shift+R)

### 3.2 Test Flow
1. หา Sales Order Draft SA — ที่:
   - `custbody_is_shippingadvice = T`
   - `custbody_shippingadvice_status = 4` (Draft SA)
   - ยังไม่มี FOB Price
2. คลิก **Confirm Shipping Advice**
   - Dialog: "Please enter FOB Price before..." → OK → ไปหน้า FOB Price
3. คำนวณ FOB → Submit → กลับมา SA
4. **Refresh page** (Cmd+Shift+R)
5. คลิก **Confirm Shipping Advice** อีกครั้ง
   - Dialog: "Would you like to Confirm Shipping Advice?" → OK
6. รอ redirect กลับ SA

### 3.3 Verification Points

| Verify | Where | Expected |
|--------|-------|----------|
| SA Status | บน SA → field "Status" | **Confirmed** |
| Email Sent Flag | บน SA → `custbody_sa_email_sent` | ☑ Checked |
| Email Sent Date | บน SA → `custbody_sa_email_sent_date` | วันเวลา ณ ปัจจุบัน |
| Email Inbox | ทุก recipient ที่ check flag | ได้รับ email พร้อม HTML format |
| Email Subject | Subject ของ email | `Shipping Advice Confirmed : SAE-XX-XX-...` (ไม่มี `[SANDBOX]` หรือ `(originally To:...)`)|
| Communication Tab | บน SA → Tab "Communication" | มี Message ใหม่ |
| Execution Log | Script → Execution Log | มี entry "SA Email | Sent OK..." |

---

## 📋 PHASE 4 — Rollback Plan (ถ้าจำเป็น)

ถ้า Production พังหลัง deploy:

### 4.1 Quick Rollback
1. ใน File Cabinet → เปิดไฟล์ `SL Shipping Advice Export.js`
2. ดู **Revision History** (NetSuite เก็บ version เก่าไว้)
3. Restore ไปยัง version ก่อนหน้า
   หรือ
4. Upload ไฟล์ original `SL Shipping Advice Export.js` (backup ใน project folder) ทับ

### 4.2 Disable Email Without Rollback
ถ้าอยากให้ status update ทำงานปกติแต่ไม่ส่ง email ชั่วคราว:
- Mark **ทุก** Employee `custentity_receive_email = F`
- → script จะหา recipients = 0 → log "No recipients found" → skip email
- → status update ยังทำงานปกติ

---

## 📋 PHASE 5 — Post-Deploy Monitoring (3-7 วันแรก)

### 5.1 Monitor Daily
```
Customization → Scripting → Scripts → SL Shipping Advice Export → Execution Log
   → Filter Type: ERROR
   → Filter Date: last 24h
```
→ ถ้ามี ERROR ที่ไม่ใช่ `Send SA Confirmed Email Failed (Non-blocking)` ที่ตามด้วย message ที่บอกชัดเจน → investigate

### 5.2 Check Email Deliverability
- ถามทีม recipient ว่า email มาครบไหม
- เช็ค spam folder
- Verify จาก Communication Tab ของ SA แต่ละตัว

### 5.3 Performance Check
- ใน Execution Log → ดู `Remaining Usage` ตอน End step
- ถ้าน้อยกว่า 500 บ่อยๆ → ต้อง optimize (refactor batch lookup)

---

## 📁 Files in this Project Folder

| File | Purpose | Deploy? |
|------|---------|---------|
| `SL Shipping Advice Export (Modified).js` | ✅ ไฟล์ที่จะ deploy | YES |
| `SL Shipping Advice Export.js` | Original (Sandbox backup) | NO |
| `UE_Sales_Order.js` | Reference only | NO |
| `SL FOB Price.js` | Reference only | NO |
| `DEPLOYMENT_GUIDE.md` | คู่มือนี้ | NO |

---

## 🆘 Contact Points

| ปัญหา | ติดต่อ |
|-------|--------|
| Custom field สร้างไม่ผ่าน | NetSuite Admin |
| Email ไม่ส่ง (มี log) | ดู Execution Log → ส่งมาให้ Dev |
| Email ไม่ส่ง (ไม่มี log) | เช็คว่า button click เข้า Suitelet ตัวจริงหรือ Alert version |
| Recipient ไม่ครบ | Verify `custentity_receive_email = T` + email field มีค่า |

---

## 🔖 Quick Reference: Script Internal IDs

| Item | Sandbox | Production |
|------|---------|------------|
| Confirm SA Suitelet (`customscript_sl_shipping_advice_export`) | 2453 | ? (ค้นได้จาก Customization → Scripts) |
| FOB Price Suitelet (`customscript_sl_fob_price`) | 2144 | ? |
| Sender Employee (OH Team) | 100856 | ต้อง verify ว่าตรงกัน |

> **Note:** Internal IDs ใน Sandbox vs Production มัก**ต่างกัน** อย่าใช้ตัวเลข hard-code  
> Script ใช้ `customscript_*` (Text ID) ทำให้ Suitelet ทำงานข้าม environment ได้  
> แต่ `SENDER_EMPLOYEE_ID = 100856` เป็น hard-code ตัวเลข — **ต้อง verify**

---

## ✅ Final Deployment Sign-off — DONE 2026-06-11

- [x] Phase 1 — Setup complete (fields/records/deployment ตั้งไว้ในระบบแล้ว)
- [x] Phase 2 — Script uploaded (+ verified identical via re-import diff)
- [x] Phase 3 — Smoke test PASS (เทสต์ผ่านใน SB1: PI No., Closing/VGM time 24h, Grade)
- [x] Phase 4 — Rollback plan ready (backup: `Backup Script PROD/...pre-deploy 2026-06-11.js`)
- [ ] Phase 5 — Post-deploy monitoring (เฝ้าดู production จริง 1-2 วันแรก)
- [x] Sender Employee ID 100856 (OH Team) ยืนยันถูกต้องใน Production
