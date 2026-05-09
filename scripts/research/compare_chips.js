import { yahooFinance } from '../../config/yahooFinance.js';
import { RSI, EMA } from 'technicalindicators';

async function compareChips() {
    const symbols = ['NVDA', 'AMD', 'ARM', 'INTC'];
    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    console.log("📊 Quick Comparison: AMD vs ARM vs INTC vs NVDA (Last 1 Year)");
    console.log("=".repeat(60));

    for (const symbol of symbols) {
        try {
            const result = await yahooFinance.historical(symbol, {
                period1: oneYearAgo,
                period2: now,
                interval: '1d'
            });

            if (!result || result.length === 0) {
                console.log(`${symbol}: No data found.`);
                continue;
            }

            const startPrice = result[0].close;
            const endPrice = result[result.length - 1].close;
            const returnPct = ((endPrice - startPrice) / startPrice) * 100;

            const closes = result.map(r => r.close);
            const rsiArr = RSI.calculate({ values: closes, period: 14 });
            const ema200Arr = EMA.calculate({ values: closes, period: 200 });

            const currentRsi = rsiArr[rsiArr.length - 1];
            const currentEma200 = ema200Arr[ema200Arr.length - 1];
            const price = result[result.length - 1].close;

            // Score logic from ultimate_comparison.js
            let score = 50;
            if (price < currentEma200) score += 15;
            if (currentRsi < 30) score += 15;
            else if (currentRsi > 70) score -= 15;

            console.log(`${symbol.padEnd(5)} | Return: ${returnPct.toFixed(2).padStart(7)}% | RSI: ${currentRsi?.toFixed(2) || 'N/A'} | Price vs EMA200: ${(price / currentEma200).toFixed(2)}x | Smart Score: ${score}`);
        } catch (e) {
            console.log(`${symbol}: Error fetching data - ${e.message}`);
        }
    }
    console.log("=".repeat(60));
}

compareChips();
