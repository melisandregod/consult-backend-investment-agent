import dotenv from 'dotenv';
import { getPortfolioSummary } from '../../services/portfolioService.js';
import { getHistoricalSafe } from '../../services/marketDataService.js';

dotenv.config();

async function runBlindRebalanceBacktest() {
    // 1. Get Inputs from CLI
    const years = parseInt(process.argv[2]) || 5;
    const monthlyBudget = parseFloat(process.argv[3]) || 300;
    const frequency = (process.argv[4] || 'quarterly').toLowerCase();

    console.log(`📊 Starting BLIND Rebalance Backtest: $${monthlyBudget} Monthly, Rebalance: ${frequency.toUpperCase()} (Last ${years} Years)\n`);

    try {
        const portfolio = await getPortfolioSummary();
        const assets = portfolio.filter(a => a.target_alloc > 0);
        const totalTargetAlloc = assets.reduce((sum, a) => sum + a.target_alloc, 0);

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

        const dates = [];
        for (let i = (years * 12) - 1; i >= 0; i--) {
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

        let stepIndex = 0;
        for (const date of dates) {
            const currentMonth = date.getMonth() + 1;
            cash += monthlyBudget;
            totalInvested += monthlyBudget;

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

            if (portfolioValueBefore > maxPortfolioValue) {
                maxPortfolioValue = portfolioValueBefore;
            } else if (maxPortfolioValue > 0) {
                const drawdown = (portfolioValueBefore - maxPortfolioValue) / maxPortfolioValue;
                if (drawdown < maxDrawdown) maxDrawdown = drawdown;
            }

            let isRebalanceStep = (frequency === 'monthly') || 
                                 (frequency === 'quarterly' && [3, 6, 9, 12].includes(currentMonth)) || 
                                 (frequency === 'yearly' && currentMonth === 12);

            if (isRebalanceStep) {
                // REBALANCE LOGIC
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
                    }
                }
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
            } else {
                // BLIND DCA LOGIC
                for (const asset of assets) {
                    const price = currentPrices[asset.symbol];
                    if (!price) continue;
                    const buyUsd = monthlyBudget * (asset.target_alloc / totalTargetAlloc);
                    const buyQty = buyUsd / price;
                    const h = holdings[asset.symbol];
                    const totalCost = (h.qty * h.avg_cost) + buyUsd;
                    h.qty += buyQty;
                    h.avg_cost = h.qty > 0 ? totalCost / h.qty : 0;
                    cash -= buyUsd;
                }
            }
            stepIndex++;
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

        console.log(`🏆 BLIND REBALANCE SUMMARY (${years} YEARS, ${frequency.toUpperCase()})`);
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

runBlindRebalanceBacktest();
