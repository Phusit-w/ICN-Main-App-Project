// แนะนำการใช้งาน (Guided Tour) text for the ค้นหาโครงการ page. Same mechanics as
// lib/soc-tours.ts: each step points at the control marked data-tour="<target>",
// and a step whose control isn't on screen is dropped. Wording follows the labels.
// The filters live folded under one ตัวกรอง button, so the tour points at that
// button rather than at each box inside it.
import type { SocTourStep } from "@/lib/soc-tours";

export const PROJECT_CARD_TOUR: SocTourStep[] = [
  { target: "search", title: "ค้นหา", body: "พิมพ์รหัสโครงการ ลูกค้า ชื่อโครงการ หรือคำอธิบาย ภาษาไทยหรืออังกฤษก็ได้ เช่น Solarcell, RFID, MEA" },
  {
    target: "filters",
    title: "ตัวกรอง",
    body: "กดเพื่อเปิดตัวกรอง: ลูกค้า หมวดหมู่ ลักษณะงาน ช่วงปี งบประมาณ (ล้านบาท) และเอกสาร ติ๊ก “สัญญา” หรือ “หนังสือรับรอง” เพื่อดูเฉพาะโครงการที่มีเอกสารนั้น “หนังสือรับรองออกภายใน” ใช้หาผลงานตามอายุที่ TOR กำหนด ตัวเลขบนปุ่มคือจำนวนตัวกรองที่ใช้อยู่",
  },
  { target: "active-filters", title: "ตัวกรองที่ใช้อยู่", body: "ตัวกรองที่ใช้อยู่แสดงเป็นป้าย กด × เพื่อเอาออกทีละอัน หรือ “ล้างทั้งหมด” กลับไปแสดงทุกโครงการ" },
  { target: "search-button", title: "ค้นหา", body: "กด “ค้นหา” (หรือ Enter) เพื่อใช้คำค้นและตัวกรองทั้งหมดพร้อมกัน" },
  { target: "results", title: "ผลการค้นหา", body: "กดแถวเพื่อดูรายละเอียดและคัดลอกที่อยู่ไฟล์ บนจอกว้างกดหัวคอลัมน์เพื่อเรียงตามปี งบ ชื่อ หรือลูกค้า" },
  { target: "export", title: "ส่งออก Excel", body: "ดาวน์โหลดโครงการที่แสดงอยู่เป็นไฟล์ Excel ตามคำค้น ตัวกรอง และลำดับที่เรียงไว้ ถ้าไม่ได้กรองจะได้ทุกโครงการ แผ่นงาน “เงื่อนไข” บอกว่าใช้ตัวกรองอะไร" },
];
