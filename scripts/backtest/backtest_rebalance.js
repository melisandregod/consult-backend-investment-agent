import dotenv from 'dotenv';
import { getPortfolioSummary } from '../../services/portfolioService.js';
import { getHistoricalSafe } from '../../services/marketDataService.js';
import { computeDecision, distributeBudget } from '../../services/analysisService.js';
import { extractCloseSeries } from '../../utils/math.js';

dotenv.config();

async function runRebalanceBacktest() {
    // 1. Get Inputs from CLI
    const years = parseInt(process.argv[2]) || 5;
    const monthlyBudget = parseFloat(process.argv[3]) || 300;
    const frequency = (process.argv[4] || 'quarterly').toLowerCase(); // weekly, monthly, quarterly, yearly

    console.log(`📊 Starting HYBRID Backtest (Smart DCA + Rebalance): $${monthlyBudget} Monthly, Rebalance: ${frequency.toUpperCase()} (Last ${years} Years)\n`);

    try {
        const portfolio = await getPortfolioSummary();
        const assets = portfolio.filter(a => a.target_alloc > 0);
        const totalTargetAlloc = assets.reduce((sum, a) => sum + a.target_alloc, 0);

        if (assets.length === 0) {
            console.error("❌ No assets with target allocation found.");
            return;
        }

        const now = new Date();
        const startDate = new Date();
        startDate.setFullYear(now.getFullYear() - years);
        // Fetch 6 extra months for indicator calculation (EMA200)
        const fetchStartDate = new Date(startDate);
        fetchStartDate.setMonth(fetchStartDate.getMonth() - 10);

        console.log(`⏳ Fetching historical data for ${assets.length} assets...`);
        const assetHistories = {};
        for (const asset of assets) {
            let ySym = asset.symbol.trim().toUpperCase();
            if (['BTC', 'ETH', 'SOL'].includes(ySym)) ySym += '-USD';
            assetHistories[asset.symbol] = await getHistoricalSafe(ySym, {
                period1: fetchStartDate,
                period2: now,
                interval: '1d'
            });
        }

        const dates = [];
        const totalMonths = years * 12;
        for (let i = totalMonths - 1; i >= 0; i--) {
            const d = new Date();
            d.setMonth(now.getMonth() - i);
            d.setDate(27);
            dates.push(new Date(d));
        }

        let cash = 0;
        let totalInvested = 0;
        let maxPortfolioValue = 0;
        let maxDrawdown = 0;
        const holdings = {}; 
        assets.forEach(a => holdings[a.symbol] = { qty: 0, avg_cost: 0 });

        let totalProceedsFromSelling = 0;
        let stepIndex = 0;
        for (const date of dates) {
            const currentMonth = date.getMonth() + 1; // 1-12
            cash += monthlyBudget;
            totalInvested += monthlyBudget;

            // 1. Calculate current prices and total portfolio value
            const currentPrices = {};
            let portfolioValueBefore = cash;
            for (const asset of assets) {
                const history = assetHistories[asset.symbol];
                const dayData = history.filter(h => new Date(h.date) <= date).pop();
                if (dayData) {
                    currentPrices[asset.symbol] = dayData.close;
                    portfolioValueBefore += holdings[asset.symbol].qty * dayData.close;
                }
            }

            // 2. Track Drawdown
            if (portfolioValueBefore > maxPortfolioValue) {
                maxPortfolioValue = portfolioValueBefore;
            } else if (maxPortfolioValue > 0) {
                const drawdown = (portfolioValueBefore - maxPortfolioValue) / maxPortfolioValue;
                if (drawdown < maxDrawdown) maxDrawdown = drawdown;
            }

            // 3. Determine if Rebalance Step
            let isRebalanceStep = false;
            if (frequency === 'monthly') isRebalanceStep = true;
            else if (frequency === 'quarterly' && [3, 6, 9, 12].includes(currentMonth)) isRebalanceStep = true;
            else if (frequency === 'yearly' && currentMonth === 12) isRebalanceStep = true;

            if (isRebalanceStep) {
                // REBALANCE LOGIC (Matches calculateRebalance in analysisService.js)
                // a) Trim first
                for (const asset of assets) {
                    const price = currentPrices[asset.symbol];
                    if (!price) continue;
                    
                    const targetUsd = portfolioValueBefore * asset.target_alloc;
                    const currentUsd = holdings[asset.symbol].qty * price;
                    
                    if (currentUsd > targetUsd) {
                        const sellUsd = currentUsd - targetUsd;
                        const sellQty = sellUsd / price;
                        holdings[asset.symbol].qty -= sellQty;
                        cash += sellUsd;
                        totalProceedsFromSelling += sellUsd;
                    }
                }
                // b) Buy to target
                for (const asset of assets) {
                    const price = currentPrices[asset.symbol];
                    if (!price) continue;

                    const targetUsd = portfolioValueBefore * asset.target_alloc;
                    const currentUsd = holdings[asset.symbol].qty * price;
                    
                    if (currentUsd < targetUsd) {
                        const buyUsd = targetUsd - currentUsd;
                        const buyQty = buyUsd / price;
                        const h = holdings[asset.symbol];
                        const totalCost = (h.qty * h.avg_cost) + buyUsd;
                        h.qty += buyQty;
                        h.avg_cost = h.qty > 0 ? totalCost / h.qty : 0;
                        cash -= buyUsd;
                    }
                }

                // Financial Integrity Check
                let portfolioValueAfter = cash;
                for (const asset of assets) {
                    if (currentPrices[asset.symbol]) {
                        portfolioValueAfter += holdings[asset.symbol].qty * currentPrices[asset.symbol];
                    }
                }
                if (Math.abs(portfolioValueAfter - portfolioValueBefore) > 0.1) {
                    console.warn(`⚠️ Warning: Financial leak at ${date.toISOString().split('T')[0]}. Gap: $${(portfolioValueAfter - portfolioValueBefore).toFixed(4)}`);
                }
            } else {
                // HYBRID DCA LOGIC (Smart DCA / Selective Buy)
                const analysisResults = [];
                for (const asset of assets) {
                    const history = assetHistories[asset.symbol];
                    const slice = history?.filter(h => new Date(h.date) <= date);
                    if (!slice || slice.length < 200) continue;

                    const price = currentPrices[asset.symbol];
                    const closes = extractCloseSeries(slice);
                    const current_alloc = portfolioValueBefore > 0 ? (holdings[asset.symbol].qty * price) / portfolioValueBefore : 0;
                    
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

                const distributedResults = distributeBudget(analysisResults, assets, cash, portfolioValueBefore);
                for (const res of distributedResults) {
                    if (res.recommend_usd > 0) {
                        const buyUsd = res.recommend_usd;
                        const buyQty = buyUsd / res.price;
                        const h = holdings[res.symbol];
                        const totalCost = (h.qty * h.avg_cost) + buyUsd;
                        h.qty += buyQty;
                        h.avg_cost = h.qty > 0 ? totalCost / h.qty : 0;
                        cash -= buyUsd;
                    }
                }
            }
            stepIndex++;
        }

        // 4. Final Summary
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
                current_price: finalPrice,
                target: asset.target_alloc / totalTargetAlloc
            });
        }

        console.log("--------------------------------------------------");
        console.log(`🏆 REBALANCE SUMMARY (${years} YEARS, ${frequency.toUpperCase()})`);
        console.log("--------------------------------------------------");
        results.forEach(item => {
            const allocPct = (item.value / finalValue) * 100;
            const targetPct = item.target * 100;
            const profitPct = item.qty > 0 ? ((item.current_price - item.avg_cost) / item.avg_cost) * 100 : 0;
            console.log(`- ${item.symbol.padEnd(6)}: Value: $${item.value.toFixed(2).padStart(9)} | Alloc: ${allocPct.toFixed(1).padStart(4)}% (Target: ${targetPct.toFixed(1)}%) | Profit: ${profitPct.toFixed(1).padStart(6)}%`);
        });
        console.log("--------------------------------------------------");

        const totalProfit = finalValue - totalInvested;
        const totalProfitPct = (totalProfit / totalInvested) * 100;
        const cagr = (Math.pow(finalValue / totalInvested, 1 / years) - 1) * 100;

        console.log("\nFinancials:");
        console.log(`Total Invested:   $${totalInvested.toFixed(2)}`);
        console.log(`Total Profit Taken: $${totalProceedsFromSelling.toFixed(2)} (Rebalanced)`);
        console.log(`Final Value:      $${finalValue.toFixed(2)}`);
        console.log(`Net Profit/Loss:  $${totalProfit.toFixed(2)} (${totalProfitPct.toFixed(2)}%)`);
        console.log(`Annualized Rate:  ${cagr.toFixed(2)}% (CAGR)`);
        console.log(`Max Drawdown:     ${(maxDrawdown * 100).toFixed(2)}%`);
        console.log(`Remaining Cash:   $${cash.toFixed(2)}`);
        console.log("--------------------------------------------------\n");

    } catch (error) {
        console.error("❌ Backtest failed:", error);
    }
}

runRebalanceBacktest();
