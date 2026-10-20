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
