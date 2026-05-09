import { getTransactions, getPortfolioSummary } from '../../services/portfolioService.js';
import { getHistoricalSafe, getMarketInfo } from '../../services/marketDataService.js';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_BENCHMARKS = [
    { name: 'S&P 500', symbol: '^GSPC' },
    { name: 'NASDAQ', symbol: '^IXIC' },
    { name: 'Bitcoin', symbol: 'BTC-USD' },
    { name: 'Gold', symbol: 'GC=F' }
];

async function runMultiBenchmarkComparison(customSymbol = null) {
    const benchmarks = [...DEFAULT_BENCHMARKS];
    if (customSymbol) {
        benchmarks.push({ name: `Custom (${customSymbol})`, symbol: customSymbol });
    }

    console.log("🔍 วิเคราะห์การเปรียบเทียบพอร์ตกับหลาย Benchmarks (DCA Simulation)...");

    try {
        const transactions = await getTransactions();
        if (transactions.length === 0) {
            console.log("❌ ไม่พบข้อมูลธุรกรรม");
            return;
        }

        transactions.sort((a, b) => new Date(a.Date) - new Date(b.Date));
        const firstDate = new Date(transactions[0].Date);
        const lastDate = new Date();

        console.log(`📅 ช่วงเวลาที่วิเคราะห์: ${firstDate.toLocaleDateString()} ถึง ${lastDate.toLocaleDateString()}`);
        console.log(`💰 เงินต้นรวม: $${transactions.reduce((s, t) => s + t.Total_USD, 0).toFixed(2)}`);

        // 1. ดึงข้อมูลประวัติของทุก Benchmark
        const benchmarkData = {};
        for (const bm of benchmarks) {
            process.stdout.write(`⏳ ดึงข้อมูล ${bm.name}... `);
            try {
                const history = await getHistoricalSafe(bm.symbol, {
                    period1: new Date(firstDate.getTime() - 10 * 24 * 60 * 60 * 1000),
                    period2: lastDate,
                    interval: '1d'
                });
                const current = await getMarketInfo(bm.symbol);
                benchmarkData[bm.symbol] = { history, currentPrice: current.price, name: bm.name, units: 0 };
                console.log("✅");
            } catch (e) {
                console.log(`❌ พลาด (${e.message})`);
            }
        }

        // 2. คำนวณ DCA Simulation สำหรับแต่ละ Benchmark
        let totalInvested = 0;
        transactions.forEach(t => {
            totalInvested += t.Total_USD;
            const tDate = new Date(t.Date);

            for (const symbol in benchmarkData) {
                const bm = benchmarkData[symbol];
                const match = bm.history.filter(h => new Date(h.date) <= tDate).pop();
                if (match) {
                    bm.units += t.Total_USD / match.close;
                }
            }
        });

        // 3. คำนวณมูลค่าพอร์ตปัจจุบัน
        const portfolio = await getPortfolioSummary();
        const portfolioMarketInfos = await Promise.all(portfolio.map(a => getMarketInfo(a.symbol)));
        let currentPortfolioValue = 0;
        portfolio.forEach((asset, i) => {
            currentPortfolioValue += (portfolioMarketInfos[i].price * asset.qty);
        });

        const portfolioReturn = ((currentPortfolioValue / totalInvested) - 1) * 100;

        // 4. แสดงผลลัพธ์แบบตาราง
        console.log("\n" + "=".repeat(75));
        console.log(`🏆 สรุปผลการเปรียบเทียบ (เปรียบเทียบเงิน $${totalInvested.toFixed(2)})`);
        console.log("=".repeat(75));
        console.log(`${"Asset / Benchmark".padEnd(25)} | ${"Current Value".padStart(15)} | ${"Return %".padStart(12)} | ${"Status"}`);
        console.log("-".repeat(75));

        console.log(`${"Your Portfolio".padEnd(25)} | $${currentPortfolioValue.toFixed(2).padStart(14)} | ${portfolioReturn.toFixed(2).padStart(11)}% | ⭐`);

        for (const symbol in benchmarkData) {
            const bm = benchmarkData[symbol];
            const val = bm.units * bm.currentPrice;
            const ret = ((val / totalInvested) - 1) * 100;
            const status = portfolioReturn > ret ? "🟢 คุณชนะ" : "🔴 คุณแพ้";
            console.log(`${bm.name.padEnd(25)} | $${val.toFixed(2).padStart(14)} | ${ret.toFixed(2).padStart(11)}% | ${status}`);
        }
        console.log("=".repeat(75));

    } catch (error) {
        console.error("❌ เกิดข้อผิดพลาด:", error);
    }
}

const args = process.argv.slice(2);
runMultiBenchmarkComparison(args[0]);
