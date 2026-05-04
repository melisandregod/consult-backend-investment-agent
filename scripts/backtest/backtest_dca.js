import dotenv from 'dotenv';
import { getPortfolioSummary } from '../../services/portfolioService.js';
import { getHistoricalSafe } from '../../services/marketDataService.js';
import { computeDecision, distributeBudget } from '../../services/analysisService.js';
import { extractCloseSeries } from '../../utils/math.js';

dotenv.config();

async function runBacktest() {
    console.log("📊 Starting Backtest: $300 Monthly DCA on the 27th (Last 5 Years)\n");

    try {
        const portfolio = await getPortfolioSummary();
        const assets = portfolio.filter(a => a.target_alloc > 0);
        console.log(`✅ Loaded ${assets.length} assets with target allocations.`);

        const years = 5;
        const now = new Date();
        const startDate = new Date();
        startDate.setFullYear(now.getFullYear() - years);
        startDate.setMonth(startDate.getMonth() - 6);

        console.log(`⏳ Fetching historical data for ${years} years...`);
        const assetHistories = {};
        for (const asset of assets) {
            let ySym = asset.symbol.trim().toUpperCase();
            if (['BTC', 'ETH', 'SOL'].includes(ySym)) ySym += '-USD';
            try {
                const history = await getHistoricalSafe(ySym, {
                    period1: startDate,
                    period2: now,
                    interval: '1d'
                });
                assetHistories[asset.symbol] = history;
            } catch (err) {}
        }

        const buyDates = [];
        const totalMonths = years * 12;
        for (let i = totalMonths - 1; i >= 0; i--) {
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
            const monthlyBudget = 300;
            const dateStr = buyDate.toISOString().split('T')[0];
            
            const currentPrices = {};
            const analysisResults = [];

            let portfolioValue = cash;
            for (const asset of assets) {
                const history = assetHistories[asset.symbol];
                const dayData = history?.filter(h => new Date(h.date) <= buyDate).pop();
                if (dayData) {
                    currentPrices[asset.symbol] = dayData.close;
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
                const slice = history?.filter(h => new Date(h.date) <= buyDate);
                if (!slice || slice.length < 200) continue;

                const price = currentPrices[asset.symbol];
                const closes = extractCloseSeries(slice);
                const current_alloc = portfolioValue > 0 ? (holdings[asset.symbol].qty * price) / portfolioValue : 0;
                
                const decision = computeDecision({
                    price,
                    closes,
                    avg_cost: holdings[asset.symbol].avg_cost,
                    current_alloc,
                    target_alloc: asset.target_alloc,
                    fng: 50,
                    budget: monthlyBudget, 
                    history: slice
                });

                analysisResults.push({
                    symbol: asset.symbol,
                    price,
                    score: decision.score,
                    action: decision.action,
                    allocation_current_pct: current_alloc * 100
                });
            }

            // Use Smart Budget Distribution 2.0 (Same as API)
            const distributedResults = distributeBudget(analysisResults, assets, cash, portfolioValue);
            let targets = distributedResults.filter(r => r.recommend_usd > 0);
            
            if (targets.length > 0) {
                for (const res of targets) {
                    const buyUsd = res.recommend_usd;
                    const buyQty = buyUsd / res.price;
                    const h = holdings[res.symbol];
                    const totalCost = (h.qty * h.avg_cost) + buyUsd;
                    h.qty += buyQty;
                    h.avg_cost = totalCost / h.qty;
                    cash -= buyUsd;
                }
            }
        }

        // 6. Final Summary
        console.log("\n--------------------------------------------------");
        console.log("🏆 SELECTIVE BUY SUMMARY (5 YEARS)");
        console.log("--------------------------------------------------");
        
        let finalValue = cash;
        const assetBreakdown = [];
        for (const asset of assets) {
            const h = holdings[asset.symbol];
            const history = assetHistories[asset.symbol];
            const finalPrice = history[history.length - 1].close;
            const value = h.qty * finalPrice;
            finalValue += value;
            assetBreakdown.push({ 
                symbol: asset.symbol, 
                qty: h.qty, 
                avg_cost: h.avg_cost, 
                current_price: finalPrice, 
                value, 
                target: asset.target_alloc 
            });
        }

        console.log("Asset Breakdown & Allocation:");
        for (const item of assetBreakdown) {
            const allocPct = (item.value / finalValue) * 100;
            const targetPct = item.target * 100;
            const profitPct = item.qty > 0 ? ((item.current_price - item.avg_cost) / item.avg_cost) * 100 : 0;
            console.log(`- ${item.symbol.padEnd(6)}: Value: $${item.value.toFixed(2).padStart(9)} | Alloc: ${allocPct.toFixed(1).padStart(4)}% (Target: ${targetPct.toFixed(1)}%) | Profit: ${profitPct.toFixed(1).padStart(6)}%`);
        }

        const cashAllocPct = (cash / finalValue) * 100;
        console.log(`- CASH  : Value: $${cash.toFixed(2).padStart(9)} | Alloc: ${cashAllocPct.toFixed(1).padStart(4)}%`);
        console.log("--------------------------------------------------");

        const totalProfit = finalValue - totalInvested;
        const totalProfitPct = (totalProfit / totalInvested) * 100;
        
        // Annualized Return (CAGR) - Using simplified formula for DCA: (Final/Invested)^(1/years) - 1
        // Note: For DCA, this is a conservative estimate of the actual IRR.
        const cagr = (Math.pow(finalValue / totalInvested, 1 / years) - 1) * 100;

        console.log("\nFinancials:");
        console.log(`Total Invested:   $${totalInvested.toFixed(2)}`);
        console.log(`Final Value:      $${finalValue.toFixed(2)}`);
        console.log(`Net Profit/Loss:  $${totalProfit.toFixed(2)} (${totalProfitPct.toFixed(2)}%)`);
        console.log(`Annualized Rate:  ${cagr.toFixed(2)}% (CAGR)`);
        console.log(`Max Drawdown:     ${(maxDrawdown * 100).toFixed(2)}%`);
        console.log(`Remaining Cash:   $${cash.toFixed(2)}`);
        console.log("--------------------------------------------------");

    } catch (error) {
        console.error("❌ Backtest failed:", error);
    }
}

runBacktest();
