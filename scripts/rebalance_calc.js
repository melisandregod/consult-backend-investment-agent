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
                current_usd: currentUsd,
                target_usd: targetUsd,
                diff_usd: diffUsd,
                action: diffUsd > 0 ? "BUY" : "SELL",
                is_significant: isSignificant
            };
        });

        // ANSI Color codes - High Contrast for Green Terminals
        const colors = {
            reset: "\x1b[0m",
            bright: "\x1b[1m",
            green: "\x1b[32m",
            red: "\x1b[31m",
            yellow: "\x1b[33m",
            blue: "\x1b[34m",
            magenta: "\x1b[35m",
            cyan: "\x1b[36m",
            white: "\x1b[37m",
            gray: "\x1b[90m",
            brightYellow: "\x1b[93m",
            brightWhite: "\x1b[97m"
        };

        const borderCol = colors.brightWhite;
        const textCol = colors.white;

        console.log(`\n` + borderCol + `╔` + `═`.repeat(125) + `╗` + colors.reset);
        console.log(borderCol + `║` + colors.bright + colors.brightWhite + ` REBALANCE REPORT `.padEnd(125) + borderCol + `║` + colors.reset);
        console.log(borderCol + `╠` + `═`.repeat(125) + `╣` + colors.reset);
        
        // Header
        const header = `  Symbol │ Price      │ Current % │ Target % │ Current Value │ Target Value │ Action      │ Amount      │ Status`;
        console.log(borderCol + `║` + colors.brightWhite + colors.bright + header.padEnd(125) + borderCol + `║` + colors.reset);
        console.log(borderCol + `╟` + `─`.repeat(125) + `╢` + colors.reset);

        let totalToSell = 0;
        let totalToBuy = 0;

        rebalanceActions.forEach(r => {
            const actionColor = r.action === "SELL" ? colors.magenta : colors.brightYellow;
            const actionStr = r.action === "SELL" ? "SELL (Trim)" : "BUY (Add) ";
            const status = r.is_significant ? colors.red + colors.bright + "⚠️ OVER LIMIT" : colors.brightWhite + "✅ STABLE    ";
            
            const line = 
                `  ${colors.brightWhite}${r.symbol.padEnd(6)}${colors.reset} │ ` +
                `${textCol}$${r.price.toFixed(2).padStart(8)}${colors.reset} │ ` +
                `${textCol}${r.current_alloc_pct.toFixed(1).padStart(8)}%${colors.reset} │ ` +
                `${textCol}${r.target_alloc_pct.toFixed(1).padStart(8)}%${colors.reset} │ ` +
                `${textCol}$${r.current_usd.toFixed(2).padStart(12)}${colors.reset} │ ` +
                `${textCol}$${r.target_usd.toFixed(2).padStart(11)}${colors.reset} │ ` +
                `${actionColor}${colors.bright}${actionStr.padEnd(11)}${colors.reset} │ ` +
                `${actionColor}${colors.bright}$${Math.abs(r.diff_usd).toFixed(2).padStart(10)}${colors.reset} │ ` +
                `${status}${colors.reset}`;

            // Adjust padding to account for ANSI codes
            const rawLineLength = `  ${r.symbol.padEnd(6)} │ $${r.price.toFixed(2).padStart(8)} │ ${r.current_alloc_pct.toFixed(1).padStart(8)}% │ ${r.target_alloc_pct.toFixed(1).padStart(8)}% │ $${r.current_usd.toFixed(2).padStart(12)} │ $${r.target_usd.toFixed(2).padStart(11)} │ ${actionStr.padEnd(11)} │ $${Math.abs(r.diff_usd).toFixed(2).padStart(10)} │ `.length + 12;
            
            console.log(borderCol + `║` + colors.reset + line + "".padEnd(125 - rawLineLength) + borderCol + `║` + colors.reset);

            if (r.diff_usd < 0) totalToSell += Math.abs(r.diff_usd);
            else totalToBuy += r.diff_usd;
        });

        console.log(borderCol + `╚` + `═`.repeat(125) + `╝` + colors.reset);

        console.log(`\n` + colors.bright + colors.brightWhite + `PORTFOLIO SUMMARY:` + colors.reset);
        console.log(borderCol + `─`.repeat(40) + colors.reset);
        console.log(`Total Portfolio Value: `.padEnd(25) + colors.brightWhite + colors.bright + `$${totalPortfolioValue.toFixed(2)}` + colors.reset);
        console.log(`Total to Sell:         `.padEnd(25) + colors.magenta + `$${totalToSell.toFixed(2)}` + colors.reset);
        console.log(`Total to Buy:          `.padEnd(25) + colors.brightYellow + `$${totalToBuy.toFixed(2)}` + colors.reset);
        
        const cashDiff = totalToBuy - totalToSell - budget;
        const cashLabel = cashDiff > 0 ? "Extra Cash Needed:    " : "Cash Surplus:         ";
        const cashColor = cashDiff > 0 ? colors.red : colors.brightYellow;
        
        console.log(cashLabel.padEnd(25) + cashColor + colors.bright + `$${Math.abs(cashDiff).toFixed(2)}` + colors.reset);
        console.log(borderCol + `─`.repeat(40) + colors.reset);
        console.log(colors.gray + `* ⚠️ Significant = Deviation > 5% of target allocation` + colors.reset + `\n`);
    } catch (error) {
        console.error(`❌ Error calculating rebalance:`, error.message);
    }
}

runRebalanceCalc();
