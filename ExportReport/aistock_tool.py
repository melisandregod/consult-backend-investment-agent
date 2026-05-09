import pandas as pd
import yfinance as yf
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from fpdf import FPDF
from datetime import datetime
import calendar
import os
import sys
import json
import urllib.request

# --- CONFIGURATION ---
PORT = os.getenv('PORT', '3001')
API_URL = f'http://localhost:{PORT}/api/transactions'
OUTPUT_PDF = 'Monthly_Broker_Report_Thai.pdf'
THAI_FONT_PATH = '/System/Library/Fonts/Supplemental/Sathu.ttf' # Default macOS Thai font

# Asset types mapping (Updated with new chips)
ASSET_TYPES = {
    'AAPL': 'STOCK', 'AMZN': 'STOCK', 'BTC': 'CRYPTO', 'GOOGL': 'STOCK',
    'MSFT': 'STOCK', 'NVDA': 'STOCK', 'TSLA': 'STOCK', 'TSM': 'STOCK',
    'AMD': 'STOCK', 'ARM': 'STOCK', 'INTC': 'STOCK'
}

# Month translation
MONTH_TH = {
    1: 'มกราคม', 2: 'กุมภาพันธ์', 3: 'มีนาคม', 4: 'เมษายน',
    5: 'พฤษภาคม', 6: 'มิถุนายน', 7: 'กรกฎาคม', 8: 'สิงหาคม',
    9: 'กันยายน', 10: 'ตุลาคม', 11: 'พฤศจิกายน', 12: 'ธันวาคม'
}

# --- HELPER FUNCTIONS ---

def get_last_day_of_month(year, month):
    return calendar.monthrange(year, month)[1]

def fetch_price(ticker, date_str):
    try:
        data = yf.download(ticker, end=pd.to_datetime(date_str) + pd.Timedelta(days=1), period='5d', progress=False)
        if not data.empty:
            return float(data['Close'].iloc[-1].iloc[0]) if isinstance(data['Close'].iloc[-1], pd.Series) else float(data['Close'].iloc[-1])
    except:
        pass
    return 0.0

def fetch_transactions_from_api():
    try:
        print(f"Syncing with service: {API_URL}...")
        with urllib.request.urlopen(API_URL) as response:
            data = json.loads(response.read().decode())
            df = pd.DataFrame(data)
            df['Date'] = pd.to_datetime(df['Date'], dayfirst=True, errors='coerce')
            return df.dropna(subset=['Date'])
    except Exception as e:
        print(f"Error fetching from API: {e}")
        return None

def create_chart(data, month_name, year, font_prop, month):
    all_assets = sorted(list(data['Asset'].unique()))
    # Expanded color palette for more assets
    color_palette = [
        '#ff9999','#66b3ff','#99ff99','#ffcc99', '#c2c2f0', '#ffb3e6', 
        '#c4e17f', '#76d7c4', '#f7dc6f', '#af7ac5', '#48c9b0', '#eb984e'
    ]
    color_map = {asset: color_palette[i % len(color_palette)] for i, asset in enumerate(all_assets)}
    
    labels = data['Asset']
    sizes = data['% Allocation']
    colors = [color_map.get(asset, '#cccccc') for asset in labels]
    
    fig, ax = plt.subplots(figsize=(6, 6))
    display_labels = [l if s > 5 else "" for l, s in zip(labels, sizes)]
    
    wedges, texts, autotexts = ax.pie(
        sizes, labels=display_labels, autopct=lambda p: '{:.1f}%'.format(p) if p > 5 else '', 
        startangle=140, colors=colors, 
        pctdistance=0.75, labeldistance=1.1,
        textprops={'font_properties': font_prop, 'fontsize': 9}
    )
    
    plt.setp(autotexts, size=8, weight="bold")
    centre_circle = plt.Circle((0,0), 0.60, fc='white')
    fig.gca().add_artist(centre_circle)
    
    from matplotlib.patches import Patch
    legend_elements = [Patch(facecolor=color_map[asset], label=asset) for asset in all_assets]
    
    legend_font = font_prop.copy()
    legend_font.set_size(8)
    ax.legend(handles=legend_elements, title="Assets", loc="center left", bbox_to_anchor=(1, 0, 0.5, 1), prop=legend_font)
    
    plt.title(f'สัดส่วนการลงทุน - {month_name} {year}', font_properties=font_prop, fontsize=12, pad=10)
    
    chart_path = f'temp_chart_{month}_{year}.png'
    plt.savefig(chart_path, bbox_inches='tight', dpi=150, transparent=True)
    plt.close(fig)
    return chart_path

class AIStockPDF(FPDF):
    def __init__(self):
        super().__init__()
        self.add_font('ThaiFont', '', THAI_FONT_PATH)
        self.add_font('ThaiFontB', '', THAI_FONT_PATH)

    def header(self):
        self.set_fill_color(20, 30, 60)
        self.rect(0, 0, 210, 40, 'F')
        self.set_text_color(255, 255, 255)
        self.set_font('ThaiFont', '', 24)
        self.cell(0, 20, 'รายงานพอร์ตการลงทุนรายเดือน AIstock', align='C', new_x="LMARGIN", new_y="NEXT")
        self.set_font('ThaiFont', '', 12)
        self.cell(0, 0, 'พันธมิตรที่วางใจได้ในการบริหารความมั่งคั่งของคุณ', align='C', new_x="LMARGIN", new_y="NEXT")
        self.ln(20)

    def footer(self):
        self.set_y(-15)
        self.set_font('ThaiFont', '', 10)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f'หน้า {self.page_no()}', align='C', new_x="RIGHT", new_y="TOP")

    def section_title(self, title):
        self.set_font('ThaiFont', '', 18)
        self.set_text_color(20, 30, 60)
        self.cell(0, 10, title, align='L', new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def draw_summary_box(self, label, value, x, y, w, h, color):
        self.set_xy(x, y)
        self.set_fill_color(*color)
        self.rect(x, y, w, h, 'F')
        self.set_text_color(255, 255, 255)
        self.set_font('ThaiFont', '', 10)
        self.set_xy(x, y + 3)
        self.cell(w, 5, label, align='C', new_x="LMARGIN", new_y="NEXT")
        self.set_font('ThaiFont', '', 18)
        self.set_xy(x, y + 10)
        self.cell(w, 10, value, align='C', new_x="LMARGIN", new_y="NEXT")

def run_tool():
    target_month = None
    target_year = None
    
    if len(sys.argv) >= 2:
        try:
            target_month = int(sys.argv[1])
            if len(sys.argv) >= 3:
                target_year = int(sys.argv[2])
            else:
                target_year = datetime.now().year
            print(f"Generating report for: {MONTH_TH[target_month]} {target_year}")
        except:
            print("Invalid arguments. Usage: python aistock_tool.py [month] [year]")
            return

    print("--- AIstock Reporting Tool Starting ---")
    df_trans = fetch_transactions_from_api()
    
    if df_trans is None or df_trans.empty:
        print("Error: Could not fetch transactions from API. Please ensure the backend is running.")
        return
    
    min_date = df_trans['Date'].min()
    max_date = datetime.now()
    
    pdf = AIStockPDF()
    thai_font_prop = fm.FontProperties(fname=THAI_FONT_PATH)
    
    current_month = min_date.replace(day=1)
    if target_month and target_year:
        current_month = datetime(target_year, target_month, 1)
        limit_date = current_month + pd.DateOffset(months=1)
    else:
        limit_date = max_date + pd.DateOffset(months=1)

    while current_month < limit_date and current_month <= max_date:
        year, month = current_month.year, current_month.month
        month_name = MONTH_TH[month]
        last_day = get_last_day_of_month(year, month)
        cutoff = pd.Timestamp(year=year, month=month, day=last_day, hour=23, minute=59)
        actual_cutoff = min(cutoff, pd.Timestamp.now())
        
        df_snapshot = df_trans[df_trans['Date'] <= actual_cutoff]
        if df_snapshot.empty:
            if target_month: break
            current_month += pd.DateOffset(months=1)
            continue
            
        print(f"Processing: {month_name} {year}...")
        
        summary = df_snapshot.groupby('Asset').agg({'Quantity': 'sum', 'Total_USD': 'sum'}).reset_index()
        summary = summary[summary['Quantity'] > 0]
        
        date_str = actual_cutoff.strftime('%Y-%m-%d')
        rate = 35.0
        try:
            r_df = yf.download('USDTHB=X', end=pd.to_datetime(date_str) + pd.Timedelta(days=1), period='5d', progress=False)
            if not r_df.empty: 
                val = r_df['Close'].iloc[-1]
                rate = float(val.iloc[0]) if isinstance(val, pd.Series) else float(val)
        except: pass
        
        prices = {}
        for asset in summary['Asset']:
            ticker = asset if asset != 'BTC' else 'BTC-USD'
            prices[asset] = fetch_price(ticker, date_str)
            
        summary['Market Value'] = summary['Quantity'] * summary['Asset'].map(prices)
        summary['Market Value (THB)'] = summary['Market Value'] * rate
        summary['Gain/Loss (USD)'] = summary['Market Value'] - summary['Total_USD']
        summary['Gain/Loss (THB)'] = summary['Gain/Loss (USD)'] * rate
        summary['Gain/Loss (%)'] = (summary['Gain/Loss (USD)'] / summary['Total_USD']) * 100
        
        total_mkt_usd = summary['Market Value'].sum()
        total_spent_usd = summary['Total_USD'].sum()
        total_mkt_thb = summary['Market Value (THB)'].sum()
        summary['% Allocation'] = (summary['Market Value'] / total_mkt_usd) * 100 if total_mkt_usd > 0 else 0

        pdf.add_page()
        pdf.section_title(f'สรุปผลการดำเนินงาน: {month_name} {year}')

        # Boxes
        pdf.draw_summary_box('มูลค่ารวม (USD)', f"${total_mkt_usd:,.2f}", 15, 60, 60, 25, (40, 60, 110))
        pdf.draw_summary_box('มูลค่ารวม (บาท)', f"{total_mkt_thb:,.0f} บาท", 80, 60, 60, 25, (80, 110, 160))

        # Exchange Rate Info
        pdf.set_xy(80, 85)
        pdf.set_font('ThaiFont', '', 8)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(60, 5, f"(อัตราแลกเปลี่ยน: 1 USD = {rate:.2f} THB)", align='C', new_x="LMARGIN", new_y="NEXT")

        gl_val = total_mkt_usd - total_spent_usd
        gl_text = f"{gl_val:+,.2f}"
        pdf.draw_summary_box('กำไร/ขาดทุนสะสม', gl_text, 145, 60, 50, 25, (100, 140, 100) if gl_val >= 0 else (170, 80, 80))

        pdf.set_y(95)
        pdf.set_text_color(50, 50, 50)
        pdf.set_font('ThaiFont', '', 14)
        pdf.cell(120, 10, 'รายละเอียดการถือครองสินทรัพย์', align='L', new_x="RIGHT", new_y="TOP")
        pdf.cell(0, 10, 'สัดส่วนการลงทุน (%)', align='C', new_x="LMARGIN", new_y="NEXT")
        
        table_y_start = pdf.get_y()
        pdf.set_font('ThaiFont', '', 7)
        pdf.set_fill_color(240, 240, 240)
        pdf.set_draw_color(180, 180, 180)
        headers = ['สินทรัพย์', 'จำนวน', 'มูลค่า ($)', 'มูลค่า (฿)', 'กำไร ($)', 'กำไร (฿)', 'กำไร (%)']
        w = [14, 16, 18, 20, 18, 19, 15] # Total width 120
        for i, h in enumerate(headers): pdf.cell(w[i], 8, h, 1, align='C', fill=True, new_x="RIGHT", new_y="TOP")
        pdf.ln()
        
        for _, row in summary.iterrows():
            pdf.cell(w[0], 7, str(row['Asset']), 1)
            pdf.cell(w[1], 7, f"{row['Quantity']:.4f}", 1, align='R', new_x="RIGHT", new_y="TOP")
            pdf.cell(w[2], 7, f"{row['Market Value']:,.2f}", 1, align='R', new_x="RIGHT", new_y="TOP")
            pdf.cell(w[3], 7, f"{row['Market Value (THB)']:,.0f}", 1, align='R', new_x="RIGHT", new_y="TOP")
            
            pdf.set_text_color(0, 120, 0) if row['Gain/Loss (USD)'] >= 0 else pdf.set_text_color(180, 0, 0)
            pdf.cell(w[4], 7, f"{row['Gain/Loss (USD)']:+,.2f}", 1, align='R', new_x="RIGHT", new_y="TOP")
            pdf.cell(w[5], 7, f"{row['Gain/Loss (THB)']:+,.0f}", 1, align='R', new_x="RIGHT", new_y="TOP")
            
            pdf.cell(w[6], 7, f"{row['Gain/Loss (%)']:+.2f}%", 1, align='R', new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(0, 0, 0)
            
        if total_mkt_usd > 0:
            chart_path = create_chart(summary, month_name, year, thai_font_prop, month)
            pdf.image(chart_path, x=135, y=table_y_start - 5, w=70)
            os.remove(chart_path)
        
        bottom_y = max(pdf.get_y(), table_y_start + 65) 
        pdf.set_y(bottom_y + 10)
        pdf.section_title('บทวิเคราะห์และแนวโน้มตลาด')
        pdf.set_font('ThaiFont', '', 11)
        
        gl_pct = ((total_mkt_usd - total_spent_usd) / total_spent_usd) * 100 if total_spent_usd > 0 else 0
        if gl_pct > 0:
            comment = (f"ในเดือน{month_name} พอร์ตการลงทุนของคุณมีการเติบโตที่แข็งแกร่งอย่างต่อเนื่อง "
                       "โดยได้รับอานิสงส์จากสภาวะตลาดที่เอื้ออำนวย ในกลุ่มสินทรัพย์เทคโนโลยีและสินทรัพย์ที่มีการเติบโตสูง "
                       "เราขอแนะนำให้รักษาสัดส่วนการลงทุนปัจจุบันไว้ และพิจารณาการปรับสมดุล (Rebalancing) "
                       "หากสัดส่วนสินทรัพย์ใดเริ่มสูงกว่าเป้าหมาย เพื่อล็อกกำไรและควบคุมความเสี่ยง")
        else:
            comment = (f"สภาวะตลาดในเดือน{month_name} มีความผันผวนสูง ส่งผลให้มูลค่าพอร์ตมีการปรับตัวลดลงตามกลไกตลาด "
                       "อย่างไรก็ตาม ปัจจัยพื้นฐานของสินทรัพย์หลักที่คุณถือครองยังคงมีความแข็งแกร่ง "
                       "เรามองว่าจังหวะนี้เป็นโอกาสในการถือครองเพื่อรอการฟื้นตัวในระยะยาว และไม่แนะนำให้ตระหนกขายตามสภาวะตลาดชั่วคราว")
        
        pdf.multi_cell(0, 7, comment)
        if target_month: break
        current_month += pd.DateOffset(months=1)
        
    pdf_filename = OUTPUT_PDF
    if target_month and target_year:
        pdf_filename = f"Report_{target_month:02d}_{target_year}.pdf"

    pdf.output(pdf_filename)
    print(f"\nSUCCESS: Report saved as {pdf_filename}")

if __name__ == "__main__":
    run_tool()