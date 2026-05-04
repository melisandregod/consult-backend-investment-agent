import dotenv from 'dotenv';
import { getPortfolioSummary } from '../../services/portfolioService.js';
import { getHistoricalSafe } from '../../services/marketDataService.js';
import { extractCloseSeries } from '../../utils/math.js';

dotenv.config();

async function runBlindBacktest() {
    console.log("📊 Starting Blind DCA Backtest: $300 Monthly (Last 5 Years)\n");

    try {
        const portfolio = await getPortfolioSummary();
        const assets = portfolio.filter(a => a.target_alloc > 0);
        const totalTargetAlloc = assets.reduce((sum, a) => sum + a.target_alloc, 0);

        const years = 5;
        const now = new Date();
        const startDate = new Date();
        startDate.setFullYear(now.getFullYear() - years);

        const assetHistories = {};
        for (const asset of assets) {
            let ySym = asset.symbol.trim().toUpperCase();
            if (['BTC', 'ETH', 'SOL'].includes(ySym)) ySym += '-USD';
            assetHistories[asset.symbol] = await getHistoricalSafe(ySym, {
                period1: startDate,
                period2: now,
                interval: '1d'
            });
        }

        const buyDates = [];
        for (let i = (years * 12) - 1; i >= 0; i--) {
            const d = new Date();
            d.setMonth(now.getMonth() - i);
            d.setDate(27);
            buyDates.push(new Date(d));
        }

        let cash = 0;
        let totalInvested = 0;
        let maxPortfolioValue = 0;
        let maxDrawdown = 0;
        const holdings = {}; 
        assets.forEach(a => holdings[a.symbol] = { qty: 0, avg_cost: 0 });

        for (const buyDate of buyDates) {
            cash += 300;
            totalInvested += 300;
            const dateStr = buyDate.toISOString().split('T')[0];

            let portfolioValue = cash;
            for (const asset of assets) {
                const history = assetHistories[asset.symbol];
                const dayData = history.filter(h => new Date(h.date) <= buyDate).pop();
                if (dayData) {
                    portfolioValue += holdings[asset.symbol].qty * dayData.close;
                }
            }

            if (portfolioValue > maxPortfolioValue) {
                maxPortfolioValue = portfolioValue;
            } else if (maxPortfolioValue > 0) {
                const drawdown = (portfolioValue - maxPortfolioValue) / maxPortfolioValue;
                if (drawdown < maxDrawdown) maxDrawdown = drawdown;
            }

            for (const asset of assets) {
                const history = assetHistories[asset.symbol];
                const dayData = history.filter(h => new Date(h.date) <= buyDate).pop();
                if (!dayData) continue;

                // Divide $300 based on target allocation ratio
                const buyUsd = 300 * (asset.target_alloc / totalTargetAlloc);
                const buyQty = buyUsd / dayData.close;

                const h = holdings[asset.symbol];
                const totalCost = (h.qty * h.avg_cost) + buyUsd;
                h.qty += buyQty;
                h.avg_cost = totalCost / h.qty;
                cash -= buyUsd;
            }
        }

        let finalValue = cash;
        for (const asset of assets) {
            const h = holdings[asset.symbol];
            const history = assetHistories[asset.symbol];
            const finalPrice = history[history.length - 1].close;
            finalValue += h.qty * finalPrice;
        }

        const totalProfit = finalValue - totalInvested;
        const totalProfitPct = (totalProfit / totalInvested) * 100;
        const cagr = (Math.pow(finalValue / totalInvested, 1 / years) - 1) * 100;

        console.log("🏆 BLIND DCA SUMMARY (5 YEARS)");
        console.log(`Total Invested:   $${totalInvested.toFixed(2)}`);
        console.log(`Final Value:      $${finalValue.toFixed(2)}`);
        console.log(`Net Profit/Loss:  $${totalProfit.toFixed(2)} (${totalProfitPct.toFixed(2)}%)`);
        console.log(`Annualized Rate:  ${cagr.toFixed(2)}% (CAGR)`);
        console.log(`Max Drawdown:     ${(maxDrawdown * 100).toFixed(2)}%`);
        console.log("--------------------------------------------------\n");

    } catch (error) {
        console.error("❌ Backtest failed:", error);
    }
}

runBlindBacktest();
