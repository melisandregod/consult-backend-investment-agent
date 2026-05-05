import dotenv from 'dotenv';
import { getPortfolioSummary } from '../../services/portfolioService.js';
import { getHistoricalSafe } from '../../services/marketDataService.js';
import { RSI, EMA } from 'technicalindicators';

dotenv.config();

/**
 * SMART Logic (Indicator-based)
 */
function computeSmartScore(price, closes) {
    const rsiArr = RSI.calculate({ values: closes, period: 14 });
    const emaArr = EMA.calculate({ values: closes, period: 200 });
    const rsi = rsiArr[rsiArr.length - 1];
    const ema200 = emaArr[emaArr.length - 1];
    if (!rsi || !ema200) return 50;
    let score = 50;
    if (price < ema200) score += 15;
    if (rsi < 30) score += 15;
    else if (rsi > 70) score -= 15;
    return score;
}

async function runComparison(years = 10, monthlyBudget = 300) {
    console.log(`🚀 ULTIMATE 4-WAY COMPARISON (Last ${years} Years, $${monthlyBudget}/mo)`);
    console.log(`⏳ Fetching data...`);

    const portfolio = await getPortfolioSummary();
    const assets = portfolio.filter(a => a.target_alloc > 0);
    const totalTargetAlloc = assets.reduce((sum, a) => sum + a.target_alloc, 0);

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

    const buyDates = [];
    for (let i = (years * 12) - 1; i >= 0; i--) {
        const d = new Date();
        d.setMonth(now.getMonth() - i);
        d.setDate(27);
        buyDates.push(new Date(d));
    }

    const runSim = (isSmart, isRebalance) => {
        let cash = 0;
        let totalInvested = 0;
        let maxPortfolioValue = 0;
        let maxDrawdown = 0;
        const holdings = {};
        assets.forEach(a => holdings[a.symbol] = { qty: 0 });

        for (const date of buyDates) {
            cash += monthlyBudget;
            totalInvested += monthlyBudget;
            const currentMonth = date.getMonth() + 1;

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

            const shouldRebalance = isRebalance && [3, 6, 9, 12].includes(currentMonth);

            if (shouldRebalance) {
                // REBALANCE
                for (const asset of assets) {
                    const price = currentPrices[asset.symbol];
                    if (!price) continue;
                    const targetUsd = portfolioValueBefore * (asset.target_alloc / totalTargetAlloc);
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
                    const targetUsd = portfolioValueBefore * (asset.target_alloc / totalTargetAlloc);
                    const currentUsd = holdings[asset.symbol].qty * price;
                    if (currentUsd < targetUsd) {
                        const buyUsd = targetUsd - currentUsd;
                        holdings[asset.symbol].qty += (buyUsd / price);
                        cash -= buyUsd;
                    }
                }
            } else {
                // DCA
                if (isSmart) {
                    const scores = assets.map(asset => {
                        const history = assetHistories[asset.symbol];
                        const slice = history.filter(h => new Date(h.date) <= date);
                        const closes = slice.map(h => h.close);
                        return { symbol: asset.symbol, score: computeSmartScore(currentPrices[asset.symbol], closes) };
                    });
                    const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
                    for (const s of scores) {
                        const buyUsd = monthlyBudget * (s.score / totalScore);
                        if (currentPrices[s.symbol]) {
                            holdings[s.symbol].qty += (buyUsd / currentPrices[s.symbol]);
                            cash -= buyUsd;
                        }
                    }
                } else {
                    for (const asset of assets) {
                        const buyUsd = monthlyBudget * (asset.target_alloc / totalTargetAlloc);
                        if (currentPrices[asset.symbol]) {
                            holdings[asset.symbol].qty += (buyUsd / currentPrices[asset.symbol]);
                            cash -= buyUsd;
                        }
                    }
                }
            }
        }

        let finalValue = cash;
        for (const asset of assets) {
            finalValue += holdings[asset.symbol].qty * assetHistories[asset.symbol][assetHistories[asset.symbol].length - 1].close;
        }

        return {
            finalValue,
            totalInvested,
            profitPct: ((finalValue - totalInvested) / totalInvested) * 100,
            maxDrawdown: maxDrawdown * 100
        };
    };

    const results = [
        { name: "Blind DCA (No Rebalance)", ...runSim(false, false) },
        { name: "Blind DCA + Rebalance   ", ...runSim(false, true) },
        { name: "Smart DCA (No Rebalance)", ...runSim(true, false) },
        { name: "Smart DCA + Rebalance   ", ...runSim(true, true) }
    ];

    console.log("\n" + "=".repeat(80));
    console.log(`🏆 10-YEAR STRATEGY SHOWDOWN SUMMARY`);
    console.log("=".repeat(80));
    console.log(`Strategy                    | Final Value | Profit (%) | Max Drawdown`);
    console.log("-".repeat(80));
    results.sort((a, b) => b.finalValue - a.finalValue).forEach(r => {
        console.log(`${r.name.padEnd(27)} | $${r.finalValue.toFixed(2).padStart(10)} | ${r.profitPct.toFixed(2).padStart(9)}% | ${r.maxDrawdown.toFixed(2).padStart(11)}%`);
    });
    console.log("=".repeat(80));
}

runComparison();
