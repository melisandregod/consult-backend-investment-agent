import dotenv from 'dotenv';
import { getPortfolioSummary } from '../../services/portfolioService.js';
import { getHistoricalSafe } from '../../services/marketDataService.js';

dotenv.config();

async function runBtcComparison(years = 10, monthlyBudget = 300) {
    console.log(`🚀 BTC QUANTITY COMPARISON (Last ${years} Years, $${monthlyBudget}/mo)`);
    console.log(`⏳ Fetching data...`);

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

    const buyDates = [];
    for (let i = (years * 12) - 1; i >= 0; i--) {
        const d = new Date(startDate);
        d.setMonth(startDate.getMonth() + ((years * 12 - 1) - i));
        d.setDate(27);
        buyDates.push(new Date(d));
    }

    const runSim = (isRebalance) => {
        let cash = 0;
        const holdings = {};
        assets.forEach(a => holdings[a.symbol] = { qty: 0 });

        for (const date of buyDates) {
            cash += monthlyBudget;
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

            const shouldRebalance = isRebalance && [3, 6, 9, 12].includes(currentMonth);

            if (shouldRebalance) {
                // REBALANCE logic: Sell overweight, buy underweight
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
                // DCA only
                for (const asset of assets) {
                    const buyUsd = monthlyBudget * (asset.target_alloc / totalTargetAlloc);
                    if (currentPrices[asset.symbol]) {
                        holdings[asset.symbol].qty += (buyUsd / currentPrices[asset.symbol]);
                        cash -= buyUsd;
                    }
                }
            }
        }

        const btcQty = holdings['BTC'] ? holdings['BTC'].qty : 0;
        let finalValue = cash;
        for (const asset of assets) {
            const history = assetHistories[asset.symbol];
            const lastPrice = history[history.length - 1].close;
            finalValue += holdings[asset.symbol].qty * lastPrice;
        }

        return { btcQty, finalValue };
    };

    const noRebalance = runSim(false);
    const rebalance = runSim(true);

    console.log("\n" + "=".repeat(60));
    console.log(`📊 BTC QUANTITY BACKTEST RESULT (10 YEARS)`);
    console.log("=".repeat(60));
    console.log(`Strategy              | BTC Quantity   | Final Portfolio Value`);
    console.log("-".repeat(60));
    console.log(`DCA (No Rebalance)    | ${noRebalance.btcQty.toFixed(6).padStart(14)} | $${noRebalance.finalValue.toFixed(2).padStart(12)}`);
    console.log(`DCA + Rebalance       | ${rebalance.btcQty.toFixed(6).padStart(14)} | $${rebalance.finalValue.toFixed(2).padStart(12)}`);
    console.log("=".repeat(60));
    
    const qtyDiff = rebalance.btcQty - noRebalance.btcQty;
    const qtyDiffPct = (qtyDiff / noRebalance.btcQty) * 100;
    
    console.log(`\n💡 Insight:`);
    if (qtyDiff > 0) {
        console.log(`The Rebalance strategy resulted in ${qtyDiff.toFixed(6)} MORE BTC (+${qtyDiffPct.toFixed(2)}%).`);
    } else {
        console.log(`The No-Rebalance strategy resulted in ${Math.abs(qtyDiff).toFixed(6)} MORE BTC (${Math.abs(qtyDiffPct).toFixed(2)}%).`);
    }
    console.log(`\nNote: Rebalancing often trims BTC when it outperforms to buy other assets,`);
    console.log(`which can lead to less BTC but a more stable total portfolio value.`);
}

runBtcComparison();
