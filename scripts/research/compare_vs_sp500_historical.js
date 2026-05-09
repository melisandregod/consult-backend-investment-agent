import { getTransactions, getPortfolioSummary } from '../../services/portfolioService.js';
import { getHistoricalSafe, getMarketInfo } from '../../services/marketDataService.js';
import dotenv from 'dotenv';

dotenv.config();

async function runAccurateComparison() {
    console.log("🔍 วิเคราะห์ข้อมูลธุรกรรมและเปรียบเทียบกับ S&P 500 (DCA Benchmark)...");

    try {
        const transactions = await getTransactions();
        if (transactions.length === 0) {
            console.log("❌ ไม่พบข้อมูลธุรกรรม");
            return;
        }

        // เรียงลำดับตามวันที่
        transactions.sort((a, b) => new Date(a.Date) - new Date(b.Date));

        const firstDate = new Date(transactions[0].Date);
        const lastDate = new Date();

        console.log(`📅 ช่วงเวลาที่วิเคราะห์: ${firstDate.toLocaleDateString()} ถึง ${lastDate.toLocaleDateString()}`);

        // ดึงข้อมูล S&P 500 ย้อนหลังตั้งแต่วันแรกที่มีธุรกรรม
        const sp500History = await getHistoricalSafe('^GSPC', {
            period1: new Date(firstDate.getTime() - 7 * 24 * 60 * 60 * 1000), // ถอยหลัง 1 อาทิตย์กันเหนียว
            period2: lastDate,
            interval: '1d'
        });

        const findSp500Price = (dateStr) => {
            const targetDate = new Date(dateStr);
            // หาค่าที่ใกล้ที่สุดที่บันทึกไว้ (เพราะวันเสาร์อาทิตย์ตลาดปิด)
            const match = sp500History.filter(h => new Date(h.date) <= targetDate).pop();
            return match ? match.close : null;
        };

        let totalInvested = 0;
        let hypotheticalSp500Units = 0;

        transactions.forEach(t => {
            const spPrice = findSp500Price(t.Date);
            if (spPrice) {
                totalInvested += t.Total_USD;
                hypotheticalSp500Units += t.Total_USD / spPrice;
            }
        });

        // ดึงข้อมูลปัจจุบัน
        const sp500Now = await getMarketInfo('^GSPC');
        const portfolio = await getPortfolioSummary();
        const portfolioMarketInfos = await Promise.all(portfolio.map(a => getMarketInfo(a.symbol)));

        let currentPortfolioValue = 0;
        portfolio.forEach((asset, i) => {
            currentPortfolioValue += (portfolioMarketInfos[i].price * asset.qty);
        });

        const currentSp500Value = hypotheticalSp500Units * sp500Now.price;

        const portfolioReturn = ((currentPortfolioValue / totalInvested) - 1) * 100;
        const sp500Return = ((currentSp500Value / totalInvested) - 1) * 100;

        console.log("\n" + "=".repeat(50));
        console.log("🏆 การเปรียบเทียบแบบ DCA (Dollar-Weighted Return)");
        console.log("=".repeat(50));
        console.log(`เงินต้นทั้งหมดที่ลงไป:       $${totalInvested.toFixed(2)}`);
        console.log(`มูลค่าพอร์ตปัจจุบัน:         $${currentPortfolioValue.toFixed(2)} (${portfolioReturn.toFixed(2)}%)`);
        console.log(`มูลค่าถ้าซื้อ S&P 500 แทน:   $${currentSp500Value.toFixed(2)} (${sp500Return.toFixed(2)}%)`);
        console.log("=".repeat(50));

        const diff = portfolioReturn - sp500Return;
        if (diff > 0) {
            console.log(`🚀 คุณชนะ S&P 500 อยู่ ${diff.toFixed(2)}% !`);
        } else {
            console.log(`📉 คุณยังตามหลัง S&P 500 อยู่ ${Math.abs(diff).toFixed(2)}%`);
        }

        console.log("\n💡 หมายเหตุ: วิธีนี้เป็นการวัดผลที่แม่นยำที่สุด เพราะคำนวณจากเงินที่คุณจ่ายจริงในแต่ละวัน");
        console.log("เทียบกับว่าถ้าคุณเอาเงินก้อนเดียวกันนั้นไปซื้อ S&P 500 ในวินาทีเดียวกัน ผลจะเป็นอย่างไร");

    } catch (error) {
        console.error("❌ การวิเคราะห์ล้มเหลว:", error);
    }
}

runAccurateComparison();
