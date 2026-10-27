// แนะนำการใช้งาน (Guided Tour) text, one list per SOC page (see
// .scratch/soc-guided-tour/spec.md). Each step points at the control marked
// data-tour="<target>" on that page; a step whose control isn't on screen when
// the tour starts is dropped. Wording follows the on-screen labels.

export type SocTourStep = { target: string; title: string; body: string };

export const SOC_JOB_LIST_TOUR: SocTourStep[] = [
  { target: "new-job", title: "เริ่มงานตรวจใหม่", body: "กด “+ สร้างงานตรวจ” เพื่ออัปโหลดไฟล์ SOC และ PDF หลักฐาน แล้วเริ่มตรวจ" },
  { target: "runner-status", title: "SOC Runner ของคุณ", body: "Claude ตรวจได้ก็ต่อเมื่อติดตั้ง SOC Runner บนเครื่องของคุณแล้ว จุดสีเขียว = พร้อมตรวจ" },
  { target: "runner-install", title: "ติดตั้ง SOC Runner", body: "กดปุ่มนี้เพื่อสร้างคำสั่งติดตั้ง คัดลอกคำสั่งแล้ววางใน Windows PowerShell บนเครื่องของคุณ" },
  { target: "jobs-table", title: "งานตรวจของคุณ", body: "กดชื่องาน (Job Title) เพื่อเปิดงาน แถบความคืบหน้าบอกว่าตรวจข้อใหญ่ไปแล้วกี่ข้อ" },
];

export const SOC_NEW_JOB_TOUR: SocTourStep[] = [
  { target: "job-title", title: "ชื่อโครงการ", body: "ตั้งชื่องานตรวจ ชื่อนี้ต้องไม่ซ้ำกับงานตรวจอื่น และใช้เป็นชื่อไฟล์ผลลัพธ์" },
  { target: "soc-file", title: "เอกสาร SOC", body: "เลือกไฟล์ SOC หนึ่งไฟล์: Word, Excel หรือ PDF ถ้าเป็น PDF แบบสแกน ระบบจะอ่านตารางให้เบื้องหลัง (ใช้เวลานาน)" },
  { target: "evidence", title: "Datasheet / Catalog", body: "แนบ PDF หลักฐาน กด “+ เลือกโฟลเดอร์” เพื่อเลือกทั้งโฟลเดอร์ได้ ระบบเก็บชื่อโฟลเดอร์ไว้ให้ตรงกับคอลัมน์ Reference ของ SOC" },
  { target: "create-job", title: "สร้างงานตรวจ", body: "กด “สร้างงานตรวจ” เพื่ออัปโหลดไฟล์และสร้างงาน ระบบจะแยกข้อใหญ่ของ SOC ให้ตรวจทีละข้อ" },
];

export const SOC_JOB_TOUR: SocTourStep[] = [
  { target: "major-items", title: "ข้อใหญ่ของ SOC", body: "ระบบแยก SOC เป็นข้อใหญ่ให้ตรวจทีละข้อ แต่ละข้อขอตรวจแยกกันได้ และเห็นสถานะของแต่ละข้อที่นี่" },
  { target: "check-all", title: "ตรวจทั้งชุด", body: "กดเพื่อขอตรวจทุกข้อใหญ่ที่ยังไม่ได้ตรวจในครั้งเดียว SOC Runner บนเครื่องของคุณจะตรวจทีละข้อ" },
  { target: "item-actions", title: "ตรวจ / ไม่ต้องตรวจ", body: "กด “ตรวจ” เพื่อขอตรวจเฉพาะข้อนี้ ส่วน “ไม่ต้องตรวจ” ใช้กับข้อที่ไม่ต้องเทียบกับ Datasheet เช่น คุณสมบัติผู้ยื่น ข้อนั้นจะไม่นับในตรวจทั้งชุด" },
  { target: "documents", title: "เอกสารหลักฐาน", body: "ถ้าข้อไหนแจ้งว่าขาดเอกสาร มาเพิ่ม PDF ที่ส่วนนี้ แล้วกดตรวจใหม่" },
  { target: "tor-match", title: "TOR Match", body: "แนบ TOR ต้นฉบับ เพื่อดูว่าข้อความ TOR ใน SOC ตรงกับต้นฉบับหรือไม่" },
  { target: "review-filters", title: "สถานะและตัวกรอง", body: "ชิปสถานะบอกจำนวนแถวที่ผ่าน ไม่ผ่าน หรือต้องตรวจทาน กดเพื่อกรอง ปุ่ม “ตัวกรอง · เรียง” ใช้กรองตามข้อใหญ่และการตัดสิน" },
  { target: "row-ticks", title: "ติ๊กเลือกแถว", body: "ติ๊กแถวเพื่อส่งให้ Claude ตรวจใหม่เฉพาะแถวนั้น หรือดาวน์โหลด Excel เฉพาะแถวที่เลือก" },
  { target: "expand-workspace", title: "เต็มจอ", body: "กด ⤢ เพื่อเปิดพื้นที่ตรวจทานเต็มจอ ดูทีละแถวพร้อมหน้าเอกสารอ้างอิง" },
];

export const SOC_WORKSPACE_TOUR: SocTourStep[] = [
  { target: "workspace-comparison", title: "ข้อกำหนด TOR เทียบกับ SOC", body: "ด้านซ้ายแสดงข้อกำหนด TOR เทียบกับค่าที่ SOC เสนอ และผลที่ Claude ตรวจ" },
  { target: "workspace-evidence", title: "เอกสารอ้างอิง", body: "ด้านขวาแสดงหน้า PDF ที่ SOC อ้าง ใช้ปุ่มซูมหรือ “พอดีความกว้าง” เพื่ออ่านให้สบายตา" },
  { target: "workspace-decision", title: "Final Decision", body: "เลือกผลตัดสินด้วยเมาส์ หรือกดเลข 1–4 บนคีย์บอร์ด แล้วกด Ctrl+Enter เพื่อบันทึก" },
  { target: "workspace-nav", title: "เปลี่ยนข้อ", body: "ใช้ปุ่ม ← → หรือกดแป้น ← → (j/k) เพื่อเลื่อนไปข้อก่อนหน้าหรือข้อถัดไป" },
  { target: "expand-workspace", title: "กลับไปที่ตาราง", body: "กด Esc หรือปุ่ม ⤡ เพื่อย่อกลับไปอยู่ข้างตาราง" },
];
