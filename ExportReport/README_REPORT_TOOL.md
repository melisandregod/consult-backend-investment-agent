# AIstock Reporting Tool Guide

เครื่องมือนี้ใช้สำหรับสร้างรายงานพอร์ตการลงทุนรายเดือนในรูปแบบ PDF ภาษาไทยที่สวยงาม โดยดึงข้อมูลโดยตรงจาก **Investment Backend Service** (Google Sheets Sync)

## สิ่งที่ต้องเตรียม (Dependencies)
หากใช้งานในเครื่องใหม่ ต้องติดตั้ง Library เหล่านี้ก่อน:
```bash
pip install pandas yfinance matplotlib fpdf2
```
*หมายเหตุ: ไม่ต้องใช้ openpyxl แล้วเนื่องจากดึงข้อมูลผ่าน API*

## วิธีการใช้งาน
1. ตรวจสอบให้แน่ใจว่า Backend Service รันอยู่ที่ `http://localhost:3001`
2. รันคำสั่งนี้ใน Terminal:
   - **สร้างรายงานทุกเดือนตั้งแต่เริ่มต้น:**
     ```bash
     python3 aistock_tool.py
     ```
   - **สร้างรายงานเฉพาะเดือนที่ต้องการ (เช่น เดือน 5 ปี 2024):**
     ```bash
     python3 aistock_tool.py 5 2024
     ```
3. รอระบบประมวลผล (มีการดึงราคาหุ้นล่าสุดจาก Yahoo Finance)
4. รับไฟล์รายงานที่ชื่อ `Monthly_Broker_Report_Thai.pdf`

## ฟีเจอร์ของเครื่องมือ
- **Service Sync**: ดึงข้อมูล Transactions ล่าสุดจาก Google Sheets ผ่าน Backend API
- **Month Selection**: สามารถเลือกเจาะจงเดือนที่ต้องการออกรายงานได้
- **Auto-Price Update**: ดึงราคาปิดสิ้นเดือนอัตโนมัติ
- **Donut Chart**: แสดงสัดส่วนการลงทุนแยกตามสินทรัพย์
- **THB/USD Support**: คำนวณมูลค่าทั้งดอลลาร์และบาท
- **Monthly Archiving**: สร้างรายงานทุกเดือนตั้งแต่เริ่มลงทุนจนถึงปัจจุบันในไฟล์เดียว (แยกหน้า)

---
*หมายเหตุ: เครื่องมือนี้ถูกตั้งค่าให้ใช้ฟอนต์ 'Sathu' ซึ่งเป็นฟอนต์มาตรฐานของ macOS หากใช้ใน OS อื่นอาจต้องปรับเปลี่ยน PATH ของฟอนต์ในตัวโค้ด*
