import dotenv from 'dotenv';
import { getHistoricalSafe } from '../../services/marketDataService.js';

dotenv.config();

async function runScenarioComparison(years = 5, monthlyBudget = 300) {
    console.log(`🚀 SCENARIO COMPARISON: Current vs AI Chip Basket ($${monthlyBudget}/mo)`);
    console.log(`⏳ Period: Last ${years} years`);

    const baselineStocks = ['AAPL', 'AMZN', 'GOOGL', 'MSFT', 'NVDA', 'TSLA', 'TSM'];
    const newStocks = ['AMD', 'ARM', 'INTC'];
    const crypto = ['BTC'];

    const allSymbols = [...new Set([...baselineStocks, ...newStocks, ...crypto])];
    
    const now = new Date();
    const startDate = new Date();
    startDate.setFullYear(now.getFullYear() - years);

    console.log(`⏳ Fetching historical data for ${allSymbols.length} assets...`);
    const assetHistories = {};
    for (const sym of allSymbols) {
        let ySym = sym;
        if (sym === 'BTC') ySym = 'BTC-USD';
        try {
            assetHistories[sym] = await getHistoricalSafe(ySym, {
                period1: startDate,
                period2: now,
                interval: '1d'
            });
        } catch (e) {
            console.log(`⚠️ Error fetching ${sym}: ${e.message}`);
        }
    }

    const buyDates = [];
    for (let i = (years * 12) - 1; i >= 0; i--) {
        const d = new Date();
        d.setMonth(now.getMonth() - i);
        d.setDate(27);
        if (new Date(d) <= now) buyDates.push(new Date(d));
    }

    const runSim = (scenarioName, assetWeights) => {
        let cash = 0;
        let totalInvested = 0;
        const holdings = {};
        Object.keys(assetWeights).forEach(s => holdings[s] = { qty: 0 });

        let maxVal = 0;
        let maxDD = 0;

        for (const date of buyDates) {
            cash += monthlyBudget;
            totalInvested += monthlyBudget;

            // Get current prices
            const prices = {};
            let currentPortfolioValue = cash;
            for (const sym in assetWeights) {
                const history = assetHistories[sym];
                if (!history) continue;
                const dayData = history.filter(h => new Date(h.date) <= date).pop();
                if (dayData) {
                    prices[sym] = dayData.close;
                    currentPortfolioValue += holdings[sym].qty * dayData.close;
                }
            }

            if (currentPortfolioValue > maxVal) maxVal = currentPortfolioValue;
            else if (maxVal > 0) {
                const dd = (currentPortfolioValue - maxVal) / maxVal;
                if (dd < maxDD) maxDD = dd;
            }

            // Distribute budget
            // Important: Handle assets not yet traded (like ARM)
            const availableAssets = Object.keys(assetWeights).filter(sym => prices[sym] !== undefined);
            const totalAvailableWeight = availableAssets.reduce((sum, sym) => sum + assetWeights[sym], 0);

            for (const sym of availableAssets) {
                // Re-normalize weights if some assets are not yet available
                const normalizedWeight = assetWeights[sym] / totalAvailableWeight;
                const buyUsd = monthlyBudget * normalizedWeight;
                holdings[sym].qty += (buyUsd / prices[sym]);
                cash -= buyUsd;
            }
        }

        let finalValue = cash;
        for (const sym in assetWeights) {
            const history = assetHistories[sym];
            if (history && history.length > 0) {
                finalValue += holdings[sym].qty * history[history.length - 1].close;
            }
        }

        return {
            name: scenarioName,
            finalValue,
            totalInvested,
            profitPct: ((finalValue - totalInvested) / totalInvested) * 100,
            maxDrawdown: maxDD * 100
        };
    };

    // Define Scenario Weights
    const baselineWeights = { 'BTC': 0.3 };
    baselineStocks.forEach(s => baselineWeights[s] = 0.1);

    const scenario1Weights = { 'BTC': 0.3 };
    [...baselineStocks, ...newStocks].forEach(s => scenario1Weights[s] = 0.07);

    const results = [
        runSim("Current Portfolio (Baseline)", baselineWeights),
        runSim("Scenario 1 (Added 3 Chips)", scenario1Weights)
    ];

    console.log("\n" + "=".repeat(80));
    console.log(`📊 BACKTEST RESULT: 5-YEAR COMPARISON`);
    console.log("=".repeat(80));
    console.log(`Scenario                     | Final Value | Total Profit | Max Drawdown`);
    console.log("-".repeat(80));
    results.forEach(r => {
        console.log(`${r.name.padEnd(28)} | $${r.finalValue.toFixed(2).padStart(10)} | ${r.profitPct.toFixed(2).padStart(10)}% | ${r.maxDrawdown.toFixed(2).padStart(11)}%`);
    });
    console.log("=".repeat(80));
    
    const diff = results[1].finalValue - results[0].finalValue;
    console.log(`\n💡 Analysis: Scenario 1 ${diff >= 0 ? 'OUTPERFORMED' : 'UNDERPERFORMED'} Baseline by $${Math.abs(diff).toFixed(2)}`);
    if (diff > 0) {
        console.log(`Adding AMD, ARM, and Intel increased your return by ${((results[1].profitPct - results[0].profitPct)).toFixed(2)}% absolute.`);
    }
}

runScenarioComparison();
