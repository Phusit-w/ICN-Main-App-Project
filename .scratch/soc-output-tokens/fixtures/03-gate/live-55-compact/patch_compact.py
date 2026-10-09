import json
p='out/compact.json'
d=json.load(open(p,encoding='utf-8'))
TC='tc22-tc27-spec-sheet-en-us.pdf'
RF='rfd40-premium-series-spec-sheet-en-us (1).pdf'
sel_tc='อ้างโฟลเดอร์ 2.5 หลายไฟล์ เลือก TC22 เพราะข้อ ๕.๕.๑ ตรงโฟลเดอร์ย่อย 1.เครื่องอ่านแบบคอมพิวเตอร์พกพา และป้ายเลขข้อของแถวอยู่บนหน้านี้ใน TC22 → '
sel_rf='อ้างโฟลเดอร์ 2.5 หลายไฟล์ เลือก RFD40 เพราะข้อ ๕.๕.๒ ตรงโฟลเดอร์ย่อย 2.อุปกรณ์เสริมสำหรับอ่าน RFID และป้ายเลขข้อของแถวอยู่บนหน้านี้ใน RFD40 → '
det={92:'หน้า 2 (Mobility DNA Enterprise License) เกี่ยวกับ license แต่ไม่ครอบคลุมการใช้ร่วมกับ SAM',
93:'หน้า 3 Display 6.0 in. FHD+ (1080 x 2160) และ Touch Panel รองรับทุกเงื่อนไข',
94:'หน้า 3 CPU Qualcomm 5430 2.1 GHz รองรับ claim',
95:'หน้า 3 Power 3800/5200 mAh, User removable รองรับ claim',
96:'หน้า 3 Memory 6 GB RAM/64 GB UFS Flash รองรับ claim',
98:'หน้า 3 WLAN Wi-Fi 6E (802.11ax) และ Bluetooth v5.2 รองรับ claim',
99:'หน้า 3 Interface Ports USB 3.1 Type C รองรับด้านข้อมูล ส่วนการชาร์จไม่ระบุตรง',
100:'หน้า 3 Operating System Upgradeable to Android 16 รองรับ claim',
103:'หน้า 3 Standards EPC Class 1 Gen 2; EPC Gen2 V2 และ Frequency Range รองรับ ความถี่ไทยไม่ระบุตรง',
107:'หน้า 2 Adaptive Solutions (เชื่อมต่อ mobile computer/smartphone) และหน้า 3 RFID Engine Zebra Proprietary Radio Technology รองรับ'}
hl={97:'ป้าย 1.7 หน้า 3 ผูก Highlight Drop Spec. (1.5 m to concrete) และหน้า 4 ผูก Highlight Sealing IP68 and IP65 ครอบคลุมทั้งสองเงื่อนไข',
99:'ป้าย 1.9 ผูก Highlight Interface Ports USB 3.1 (Bottom Type C) ครอบคลุม USB-C; การชาร์จไม่อยู่ใน Highlight',
103:'ป้าย 2.2 ผูก Highlight Standards Supported EPC Class 1 Gen 2; EPC Gen2 V2 และ Frequency Range ครอบคลุม',
109:'ป้าย 2.8 ผูก Highlight Quick-Release, PowerPrecision+ Li-Ion 7,000 mAh battery ครอบคลุมค่าแบตและ Quick-Release'}
for r in d['results']:
    n=r['row']
    if 92<=n<=100:
        r['reference_file']=TC
        if n in det: r['reference_detail']=sel_tc+det[n]
    elif n in (103,107,109):
        r['reference_file']=RF
        if n==103: r['reference_detail']=sel_rf+det[n]
        if n==107: r['reference_detail']=sel_rf+det[n]
    if n in hl: r['highlight_evidence']=hl[n]
json.dump(d,open(p,'w',encoding='utf-8'),ensure_ascii=False,indent=1)