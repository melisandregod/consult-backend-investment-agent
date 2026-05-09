import { getPortfolioSummary, getRemainingBudget } from '../services/portfolioService.js';
import { getMarketInfo, getHistoricalSafe } from '../services/marketDataService.js';
import { analyze, calculateRebalance } from '../services/analysisService.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Rebalance Calculator Script
 */
async function runRebalanceCalc() {
    const targetMonthStr = process.argv[2]; 
    let targetDate = new Date();
    let isHistorical = false;

    if (targetMonthStr) {
        const [year, month] = targetMonthStr.split('-').map(Number);
        if (year && month) {
            targetDate = new Date(year, month, 0); 
            isHistorical = true;
        }
    }

    console.log(`\n⚖️  REBALANCE CALCULATOR`);
    console.log(`📅 Target Date: ${targetDate.toISOString().split('T')[0]} ${isHistorical ? '(HISTORICAL)' : '(CURRENT)'}`);
    console.log(`-`.repeat(50));

    try {
        const [portfolio, budget] = await Promise.all([
            getPortfolioSummary(), getRemainingBudget()
        ]);

        console.log(`📊 Current Portfolio: ${portfolio.length} assets`);
        console.log(`💰 Available Budget: $${budget}`);
        console.log(`⏳ Fetching prices...`);

        const results = [];
        let totalMarketValue = 0;

        for (const asset of portfolio) {
            let price = 0;
            if (isHistorical) {
                let ySym = asset.symbol.trim().toUpperCase();
                if (['BTC', 'ETH', 'SOL'].includes(ySym)) ySym += '-USD';
                
                const history = await getHistoricalSafe(ySym, {
                    period1: new Date(targetDate.getTime() - 7 * 24 * 60 * 60 * 1000),
                    period2: targetDate,
                    interval: '1d'
                });
                
                if (history && history.length > 0) {
                    price = history[history.length - 1].close;
                }
            } else {
                const marketInfo = await getMarketInfo(asset.symbol);
                price = marketInfo.price;
            }

            if (price === 0) {
                console.warn(`⚠️  Could not find price for ${asset.symbol}`);
                continue;
            }

            const marketValue = price * asset.qty;
            totalMarketValue += marketValue;
            results.push({
                ...asset,
                price,
                marketValue
            });
        }

        const totalPortfolioValue = totalMarketValue + Math.max(0, budget);
        
        // Calculate rebalance actions
        const rebalanceActions = results.map(res => {
            const targetUsd = totalPortfolioValue * res.target_alloc;
            const currentUsd = res.marketValue;
            const diffUsd = targetUsd - currentUsd;
            const isSignificant = Math.abs(diffUsd) > (targetUsd * 0.05);

            return {
                symbol: res.symbol,
                price: res.price,
                current_alloc_pct: (res.marketValue / totalMarketValue) * 100,
                target_alloc_pct: res.target_alloc * 100,
                diff_usd: diffUsd,
                action: diffUsd > 0 ? "BUY" : "SELL",
                is_significant: isSignificant
            };
        });

        console.log(`\n` + `=`.repeat(60));
        console.log(`REBALANCE REPORT`);
        console.log(`=`.repeat(60));
        console.log(`Symbol | Price    | Current % | Target % | Action      | Amount (USD)`);
        console.log(`-------|----------|-----------|----------|-------------|-------------`);

        let totalToSell = 0;
        let totalToBuy = 0;

        rebalanceActions.forEach(r => {
            const actionStr = r.action === "SELL" ? "SELL (Trim) " : "BUY (Add)   ";
            const sig = r.is_significant ? "⚠️" : " ";
            console.log(
                `${r.symbol.padEnd(6)} | ` +
                `$${r.price.toFixed(2).padEnd(8)} | ` +
                `${r.current_alloc_pct.toFixed(1).padStart(8)}% | ` +
                `${r.target_alloc_pct.toFixed(1).padStart(8)}% | ` +
                `${actionStr} | ` +
                `$${Math.abs(r.diff_usd).toFixed(2).padStart(10)} ${sig}`
            );

            if (r.diff_usd < 0) totalToSell += Math.abs(r.diff_usd);
            else totalToBuy += r.diff_usd;
        });

        console.log(`-`.repeat(60));
        console.log(`Total Portfolio Value: $${totalPortfolioValue.toFixed(2)}`);
        console.log(`Total to Sell:         $${totalToSell.toFixed(2)}`);
        console.log(`Total to Buy:          $${totalToBuy.toFixed(2)}`);
        console.log(`Cash needed/surplus:   $${(totalToBuy - totalToSell - budget).toFixed(2)}`);
        console.log(`=`.repeat(60));
        console.log(`⚠️  = Deviation > 5% of target amount`);
    } catch (error) {
        console.error(`❌ Error calculating rebalance:`, error.message);
    }
}

runRebalanceCalc();
