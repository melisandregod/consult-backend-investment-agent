import dotenv from 'dotenv';
import { getPortfolioSummary } from '../../services/portfolioService.js';
import { getHistoricalSafe } from '../../services/marketDataService.js';
import { RSI, EMA } from 'technicalindicators';

dotenv.config();

/**
 * OLD SMART LOGIC (For Comparison)
 */
function computeSmartDecision(price, closes) {
    const rsiArr = RSI.calculate({ values: closes, period: 14 });
    const emaArr = EMA.calculate({ values: closes, period: 200 });
    const rsi = rsiArr[rsiArr.length - 1];
    const ema200 = emaArr[emaArr.length - 1];

    if (!rsi || !ema200) return 50; // Default score

    let score = 50;
    if (price < ema200) score += 15;
    if (rsi < 30) score += 15;
    else if (rsi > 70) score -= 15;
    
    return score;
}

async function runSmartRebalanceBacktest() {
    const years = parseInt(process.argv[2]) || 5;
    const monthlyBudget = parseFloat(process.argv[3]) || 300;
    const frequency = 'quarterly';

    console.log(`📊 Starting SMART Rebalance Backtest (Indicator-based): $${monthlyBudget} Monthly (Last ${years} Years)\n`);

    try {
        const portfolio = await getPortfolioSummary();
        const assets = portfolio.filter(a => a.target_alloc > 0);
        
        const now = new Date();
        const startDate = new Date();
        startDate.setFullYear(now.getFullYear() - years);
        const fetchStart = new Date(startDate);
        fetchStart.setMonth(fetchStart.getMonth() - 10);

        const assetHistories = {};
        for (const asset of assets) {
            let ySym = asset.symbol.trim().toUpperCase();
            if (['BTC', 'ETH', 'SOL'].includes(ySym)) ySym += '-USD';
            assetHistories[asset.symbol] = await getHistoricalSafe(ySym, {
                period1: fetchStart,
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

            let isRebalanceStep = [3, 6, 9, 12].includes(currentMonth);

            if (isRebalanceStep) {
                // EXACT REBALANCE
                for (const asset of assets) {
                    const price = currentPrices[asset.symbol];
                    if (!price) continue;
                    const targetUsd = portfolioValueBefore * asset.target_alloc;
                    const currentUsd = holdings[asset.symbol].qty * price;
                    if (currentUsd > targetUsd) {
                        const sellUsd = currentUsd - targetUsd;
                        holdings[asset.symbol].qty -= (sellUsd / price);
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
                        const h = holdings[asset.symbol];
                        h.avg_cost = ((h.qty * h.avg_cost) + buyUsd) / (h.qty + (buyUsd / price));
                        h.qty += (buyUsd / price);
                        cash -= buyUsd;
                    }
                }
            } else {
                // SMART DCA (Selective Buy)
                const scores = assets.map(asset => {
                    const history = assetHistories[asset.symbol];
                    const slice = history.filter(h => new Date(h.date) <= date);
                    const closes = slice.map(h => h.close);
                    return { symbol: asset.symbol, score: computeSmartDecision(currentPrices[asset.symbol], closes) };
                });

                const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
                for (const s of scores) {
                    const buyUsd = monthlyBudget * (s.score / totalScore);
                    const price = currentPrices[s.symbol];
                    if (!price) continue;
                    const h = holdings[s.symbol];
                    h.avg_cost = ((h.qty * h.avg_cost) + buyUsd) / (h.qty + (buyUsd / price));
                    h.qty += (buyUsd / price);
                    cash -= buyUsd;
                }
            }
        }

        let finalValue = cash;
        for (const asset of assets) {
            const history = assetHistories[asset.symbol];
            finalValue += holdings[asset.symbol].qty * history[history.length - 1].close;
        }

        const totalProfit = finalValue - totalInvested;
        const totalProfitPct = (totalProfit / totalInvested) * 100;

        console.log(`🏆 SMART REBALANCE SUMMARY (${years} YEARS)`);
        console.log(`Final Value:      $${finalValue.toFixed(2)}`);
        console.log(`Net Profit/Loss:  $${totalProfit.toFixed(2)} (${totalProfitPct.toFixed(2)}%)`);
        console.log(`Max Drawdown:     ${(maxDrawdown * 100).toFixed(2)}%`);
        console.log("--------------------------------------------------\n");

    } catch (error) {
        console.error("❌ Backtest failed:", error);
    }
}

runSmartRebalanceBacktest();
