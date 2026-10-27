// แนะนำการใช้งาน (Guided Tour) text for the ค้นหาโครงการ page. Same mechanics as
// lib/soc-tours.ts: each step points at the control marked data-tour="<target>",
// and a step whose control isn't on screen is dropped. Wording follows the labels.
import type { SocTourStep } from "@/lib/soc-tours";

export const PROJECT_CARD_TOUR: SocTourStep[] = [
  { target: "search", title: "ค้นหา", body: "พิมพ์รหัสโครงการ ลูกค้า ชื่อโครงการ หรือคำอธิบาย ภาษาไทยหรืออังกฤษก็ได้ เช่น Solarcell, RFID, MEA" },
  { target: "client", title: "ลูกค้า", body: "พิมพ์หรือเลือกชื่อลูกค้า (ตรงทั้งชื่อ) เช่น PEA จะพบทั้งงานของ PEA และงานรับช่วงที่ PEA เป็นเจ้าของงาน" },
  { target: "years", title: "ช่วงปี", body: "กรองตามปีของโครงการ ใส่แค่ “ตั้งแต่ปี” หรือ “ถึงปี” อย่างเดียวก็ได้" },
  { target: "budget", title: "งบประมาณ", body: "กรองตามงบเป็นล้านบาท เช่น 10 = ตั้งแต่ 10 ล้านบาท ใช้ “งบมากกว่า” กับ “งบน้อยกว่า” คู่กันเพื่อกำหนดช่วง" },
  { target: "category", title: "หมวดหมู่", body: "พิมพ์หรือเลือกหมวดของระบบ เช่น เคเบิลใยแก้วนำแสง ตัวเลขข้างชื่อคือจำนวนโครงการ" },
  { target: "work-type", title: "ลักษณะงาน", body: "พิมพ์หรือเลือกลักษณะงาน เช่น ติดตั้ง หรือ MA โครงการหนึ่งมีได้หลายลักษณะ" },
  { target: "search-button", title: "ค้นหา / ล้างค่า", body: "กด “ค้นหา” เพื่อใช้ตัวกรองทั้งหมดพร้อมกัน “ล้างค่า” กลับไปแสดงทุกโครงการ" },
  { target: "results", title: "ผลการค้นหา", body: "กดแถวเพื่อดูรายละเอียดและคัดลอกที่อยู่ไฟล์ บนจอกว้างกดหัวคอลัมน์เพื่อเรียงตามปี งบ ชื่อ หรือลูกค้า" },
];
