import { yahooFinance } from '../../config/yahooFinance.js';
import { RSI, EMA } from 'technicalindicators';

async function auditPortfolioTechnicals() {
    const symbols = ['AAPL', 'AMZN', 'BTC-USD', 'GOOGL', 'MSFT', 'NVDA', 'TSLA', 'TSM'];
    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    console.log("🔍 FULL PORTFOLIO TECHNICAL AUDIT (1-Year Data)");
    console.log("=".repeat(85));
    console.log(`Symbol   | Price    | RSI(14) | vs EMA200 | Status         | Trend`);
    console.log("-".repeat(85));

    for (const sym of symbols) {
        try {
            const result = await yahooFinance.historical(sym, {
                period1: oneYearAgo,
                period2: now,
                interval: '1d'
            });

            const closes = result.map(r => r.close);
            const rsiArr = RSI.calculate({ values: closes, period: 14 });
            const ema200Arr = EMA.calculate({ values: closes, period: 200 });

            const price = closes[closes.length - 1];
            const rsi = rsiArr[rsiArr.length - 1];
            const ema200 = ema200Arr[ema200Arr.length - 1];
            
            const vsEma = (price / ema200).toFixed(2);
            
            let status = "NORMAL";
            if (rsi > 70) status = "🔥 OVERBOUGHT";
            else if (rsi < 30) status = "❄️ OVERSOLD";
            
            let trend = "UP";
            if (price < ema200) trend = "DOWN";

            console.log(
                `${sym.padEnd(8)} | ` +
                `$${price.toFixed(2).padStart(7)} | ` +
                `${rsi.toFixed(2).padStart(7)} | ` +
                `${vsEma.padStart(6)}x    | ` +
                `${status.padEnd(14)} | ${trend}`
            );
        } catch (e) {
            console.log(`${sym.padEnd(8)} | Error: ${e.message}`);
        }
    }
    console.log("=".repeat(85));
    console.log("💡 Note: RSI > 70 is a strong signal to TRIM/SELL. RSI < 50 is weak momentum.");
}

auditPortfolioTechnicals();
