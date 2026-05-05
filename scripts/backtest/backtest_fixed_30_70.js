import dotenv from 'dotenv';
import { getPortfolioSummary } from '../../services/portfolioService.js';
import { getHistoricalSafe } from '../../services/marketDataService.js';

dotenv.config();

async function runFixedBacktest() {
    // 1. Get Inputs from CLI (Default: 5 years, $300/month)
    const years = parseInt(process.argv[2]) || 5;
    const monthlyBudget = parseFloat(process.argv[3]) || 300;

    console.log(`📊 Starting Fixed Allocation Backtest: $${monthlyBudget} Monthly (30% BTC, 70% Others Split)`);
    console.log(`⏳ Period: Last ${years} Years\n`);

    try {
        const portfolio = await getPortfolioSummary();
        const allAssets = portfolio.filter(a => a.target_alloc > 0 || a.symbol === 'BTC');
        
        // Setup Fixed Allocations: BTC 30%, Others split remaining 70%
        const btcAsset = allAssets.find(a => a.symbol === 'BTC');
        const otherAssets = allAssets.filter(a => a.symbol !== 'BTC');
        
        const assets = [];
        if (btcAsset) {
            assets.push({ ...btcAsset, fixed_alloc: 0.30 });
        }
        
        const otherCount = otherAssets.length;
        const otherAlloc = otherCount > 0 ? 0.70 / otherCount : 0;
        
        otherAssets.forEach(a => {
            assets.push({ ...a, fixed_alloc: otherAlloc });
        });

        console.log("📈 Planned Allocation:");
        assets.forEach(a => console.log(`- ${a.symbol}: ${(a.fixed_alloc * 100).toFixed(1)}%`));
        console.log("");

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
            cash += monthlyBudget;
            totalInvested += monthlyBudget;

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

                // Divide budget based on FIXED allocation
                const buyUsd = monthlyBudget * asset.fixed_alloc;
                const buyQty = buyUsd / dayData.close;

                const h = holdings[asset.symbol];
                const totalCost = (h.qty * h.avg_cost) + buyUsd;
                h.qty += buyQty;
                h.avg_cost = totalCost / h.qty;
                cash -= buyUsd;
            }
        }

        let finalValue = cash;
        const results = [];
        for (const asset of assets) {
            const h = holdings[asset.symbol];
            const history = assetHistories[asset.symbol];
            const finalPrice = history[history.length - 1].close;
            const val = h.qty * finalPrice;
            finalValue += val;
            results.push({
                symbol: asset.symbol,
                value: val,
                qty: h.qty,
                avg_cost: h.avg_cost,
                current_price: finalPrice
            });
        }

        console.log("--------------------------------------------------");
        console.log(`🏆 FIXED 30/70 SUMMARY (${years} YEARS)`);
        console.log("--------------------------------------------------");
        results.forEach(item => {
            const allocPct = (item.value / finalValue) * 100;
            const profitPct = item.qty > 0 ? ((item.current_price - item.avg_cost) / item.avg_cost) * 100 : 0;
            console.log(`- ${item.symbol.padEnd(6)}: Value: $${item.value.toFixed(2).padStart(9)} | Alloc: ${allocPct.toFixed(1).padStart(4)}% | Profit: ${profitPct.toFixed(1).padStart(6)}%`);
        });
        console.log("--------------------------------------------------");

        const totalProfit = finalValue - totalInvested;
        const totalProfitPct = (totalProfit / totalInvested) * 100;
        const cagr = (Math.pow(finalValue / totalInvested, 1 / years) - 1) * 100;

        console.log("\nFinancials:");
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

runFixedBacktest();
