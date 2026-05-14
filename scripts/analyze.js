import { getPortfolioSummary, getRemainingBudget, getMonthlySpending } from '../services/portfolioService.js';
import { getCryptoFearGreed, getUsMarketFearGreed, getMarketInfo, isCryptoSymbol } from '../services/marketDataService.js';
import { analyze, distributeBudget, calculateRebalance } from '../services/analysisService.js';
import { getUsdThbRate } from '../services/currencyService.js';
import { extractCloseSeries } from '../utils/math.js';
import dotenv from 'dotenv';

dotenv.config();

async function runRealAnalysis() {
    console.log("🚀 Fetching DCA & Portfolio Status...");
    
    try {
        const [portfolio, budget, monthlySpending] = await Promise.all([
            getPortfolioSummary(), getRemainingBudget(), getMonthlySpending()
        ]);
        
        console.log(`📊 Found ${portfolio.length} assets in portfolio.`);
        console.log(`💰 Remaining Budget: $${budget}`);

        const spentThisMonth = Object.values(monthlySpending).reduce((sum, v) => sum + v, 0);
        if (spentThisMonth > 0) {
            console.log(`💸 Spent This Month: $${spentThisMonth.toFixed(2)}`);
        }

        const [cryptoFng, usFng] = await Promise.all([
            getCryptoFearGreed(), getUsMarketFearGreed()
        ]);
        
        console.log(`🌡️ Fear & Greed: Crypto=${cryptoFng}, US Market=${usFng}`);

        // Quarterly Logic: March, June, September, December
        const currentMonth = new Date().getMonth() + 1; // 1-12
        const rebalanceMonths = [3, 6, 9, 12];
        const forceRebalance = process.argv.includes('--rebalance');
        const isRebalanceMonth = rebalanceMonths.includes(currentMonth) || forceRebalance;
        
        // Calculate months until next rebalance
        let monthsUntilRebalance = 0;
        if (!isRebalanceMonth || (isRebalanceMonth && forceRebalance && !rebalanceMonths.includes(currentMonth))) {
            const nextRebalanceMonth = rebalanceMonths.find(m => m > currentMonth) || 3;
            monthsUntilRebalance = nextRebalanceMonth > currentMonth 
                ? nextRebalanceMonth - currentMonth 
                : (12 - currentMonth) + nextRebalanceMonth;
        }

        // 1. Pre-fetch market info for all assets to calculate total portfolio value
        console.log("⏳ Fetching market prices...");
        const marketInfos = await Promise.all(portfolio.map(a => getMarketInfo(a.symbol)));
        const marketValues = marketInfos.map((m, i) => (m.price || 0) * (portfolio[i].qty || 0));
        const totalMarketValue = marketValues.reduce((sum, v) => sum + v, 0);
        const totalPortfolioValue = totalMarketValue + Math.max(0, budget);

        // 2. Analyze each asset with accurate allocation %
        const preliminaryAnalysis = [];
        for (let i = 0; i < portfolio.length; i++) {
            const asset = portfolio[i];
            const marketInfo = marketInfos[i];
            const fng = isCryptoSymbol(asset.symbol) ? cryptoFng : usFng;
            
            // Calculate current allocation by actual current value
            const currentAllocByValue = totalMarketValue > 0 ? (marketValues[i] / totalMarketValue) : asset.current_alloc;
            const result = await analyze(asset, budget, marketInfo, currentAllocByValue);
            preliminaryAnalysis.push(result);
        }

        // 3. Smart Budget Distribution & Rebalance Calculation
        const distributedResults = distributeBudget(preliminaryAnalysis, portfolio, budget, monthlySpending);
        const finalResults = calculateRebalance(distributedResults, totalPortfolioValue);

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

        // --- QUARTERLY REBALANCE SECTION ---
        console.log(`\n` + borderCol + `╔` + `═`.repeat(100) + `╗` + colors.reset);
        if (isRebalanceMonth) {
            const alertMsg = forceRebalance && !rebalanceMonths.includes(currentMonth) 
                ? ` 🛠️  MANUAL REBALANCE TRIGGERED (FORCED) `.padEnd(100)
                : ` 🔔 QUARTERLY REBALANCE ALERT: IT'S TIME! (MAR/JUN/SEP/DEC) `.padEnd(100);
            
            console.log(borderCol + `║` + colors.magenta + colors.bright + alertMsg + borderCol + `║` + colors.reset);
            console.log(borderCol + `╠` + `═`.repeat(100) + `╣` + colors.reset);
            
            // Financial Verification
            let totalToSell = 0;
            let totalToBuy = 0;
            
            finalResults.forEach(r => {
                if (r.rebalance_diff_usd < 0) totalToSell += Math.abs(r.rebalance_diff_usd);
                else totalToBuy += r.rebalance_diff_usd;
            });

            console.log(borderCol + `║` + colors.brightWhite + colors.bright + `  Symbol │ Action      │ Amount (USD) │ Target % │ Status`.padEnd(100) + borderCol + `║` + colors.reset);
            console.log(borderCol + `╟` + `─`.repeat(100) + `╢` + colors.reset);
            
            finalResults.forEach(r => {
                const actionColor = r.rebalance_action === "SELL" ? colors.magenta : colors.brightYellow;
                const actionStr = r.rebalance_action === "SELL" ? "SELL (Trim)" : "BUY (Add) ";
                const significantMarker = r.is_rebalance_significant ? colors.red + colors.bright + "⚠️ OVER LIMIT" : colors.brightWhite + "✅ STABLE    ";
                
                const line = `  ${colors.brightWhite}${r.symbol.padEnd(6)}${colors.reset} │ ${actionColor}${colors.bright}${actionStr.padEnd(11)}${colors.reset} │ ` +
                             `${colors.white}$${Math.abs(r.rebalance_diff_usd).toFixed(2).padStart(10)}${colors.reset} │ ` +
                             `${colors.white}${r.allocation_target_pct.toFixed(1).padStart(7)}%${colors.reset} │ ` +
                             `${significantMarker}${colors.reset}`;

                // Padding adjustment for ANSI
                const rawLineLength = `  ${r.symbol.padEnd(6)} │ ${actionStr.padEnd(11)} │ $${Math.abs(r.rebalance_diff_usd).toFixed(2).padStart(10)} │ ${r.allocation_target_pct.toFixed(1).padStart(7)}% │ `.length + 12;
                console.log(borderCol + `║` + colors.reset + line + "".padEnd(100 - rawLineLength) + borderCol + `║` + colors.reset);
            });

            console.log(borderCol + `╟` + `─`.repeat(100) + `╢` + colors.reset);
            console.log(borderCol + `║` + colors.brightWhite + colors.bright + ` 💵 CASH FLOW SUMMARY:`.padEnd(100) + borderCol + `║` + colors.reset);
            console.log(borderCol + `║` + colors.white + `  Total Proceeds from Selling:  `.padEnd(35) + colors.magenta + `$${totalToSell.toFixed(2).padStart(12)}` + colors.reset + "".padEnd(53) + borderCol + `║` + colors.reset);
            console.log(borderCol + `║` + colors.white + `  Current Monthly Budget:       `.padEnd(35) + colors.brightWhite + `$${budget.toFixed(2).padStart(12)}` + colors.reset + "".padEnd(53) + borderCol + `║` + colors.reset);
            console.log(borderCol + `║` + colors.white + `  Total Available for Buying:   `.padEnd(35) + colors.brightYellow + `$${(totalToSell + budget).toFixed(2).padStart(12)}` + colors.reset + "".padEnd(53) + borderCol + `║` + colors.reset);
            console.log(borderCol + `║` + colors.white + `  Total Needed for Buying:      `.padEnd(35) + colors.yellow + `$${totalToBuy.toFixed(2).padStart(12)}` + colors.reset + "".padEnd(53) + borderCol + `║` + colors.reset);
            
            const netDiff = (totalToSell + budget) - totalToBuy;
            const statusLine = Math.abs(netDiff) < 1 
                ? colors.brightYellow + colors.bright + `  ✅ Financial Integrity Check: PASSED (Balanced)` 
                : colors.red + colors.bright + `  ❌ Financial Integrity Check: FAILED (Gap: $${netDiff.toFixed(2)})`;
            
            console.log(borderCol + `║` + colors.reset + statusLine.padEnd(100 + 14) + borderCol + `║` + colors.reset);
        } else {
            const nextMonthName = new Date(0, rebalanceMonths.find(m => m > currentMonth || 3) - 1).toLocaleString('en-US', { month: 'long' });
            console.log(borderCol + `║` + colors.brightYellow + colors.bright + ` 📅 NEXT REBALANCE IN: ${monthsUntilRebalance} MONTH(S) (${nextMonthName})`.padEnd(100) + borderCol + `║` + colors.reset);
        }
        console.log(borderCol + `╚` + `═`.repeat(100) + `╝` + colors.reset);

        // --- FINAL SUMMARY ---
        const sumBorder = colors.brightWhite;
        console.log(`\n` + sumBorder + `╔` + `═`.repeat(100) + `╗` + colors.reset);
        console.log(sumBorder + `║` + colors.brightWhite + colors.bright + ` 📈 DCA RECOMMENDATION REPORT `.padEnd(100) + sumBorder + `║` + colors.reset);
        console.log(sumBorder + `╠` + `═`.repeat(100) + `╣` + colors.reset);
        
        let totalValue = 0;
        const buyOrders = finalResults.filter(r => r.recommend_usd > 0);
        
        finalResults.forEach(r => {
            totalValue += (r.market_value || 0);
        });

        console.log(sumBorder + `║` + colors.white + `  Total Portfolio Value: `.padEnd(28) + colors.brightWhite + colors.bright + `$${totalValue.toFixed(2).padStart(12)}` + colors.reset + "".padEnd(60) + sumBorder + `║` + colors.reset);
        console.log(sumBorder + `║` + colors.white + `  Remaining Budget:      `.padEnd(28) + colors.brightYellow + `$${budget.toFixed(2).padStart(12)}` + colors.reset + "".padEnd(60) + sumBorder + `║` + colors.reset);
        
        if (buyOrders.length > 0 && !isRebalanceMonth) {
            console.log(sumBorder + `╟` + `─`.repeat(100) + `╢` + colors.reset);
            console.log(sumBorder + `║` + colors.brightWhite + colors.bright + `  🎯 Top Buy Recommendations for today:`.padEnd(100) + sumBorder + `║` + colors.reset);
            
            buyOrders.sort((a, b) => b.recommend_usd - a.recommend_usd);
            for (const order of buyOrders) {
                const spentInfo = order.dca_spent_usd > 0 ? ` (Target $${order.dca_target_usd}, Spent $${order.dca_spent_usd})` : "";
                const line = `  • ${colors.brightWhite}${order.symbol.padEnd(6)}${colors.reset}: ` + colors.brightYellow + colors.bright + `Recommend $${order.recommend_usd.toString().padEnd(6)}` + colors.reset + ` [DCA Allocation]${spentInfo}`;
                console.log(sumBorder + `║` + colors.reset + line.padEnd(100 + 23) + sumBorder + `║` + colors.reset);
            }
        } else if (!isRebalanceMonth) {
            console.log(sumBorder + `╟` + `─`.repeat(100) + `╢` + colors.reset);
            console.log(sumBorder + `║` + colors.gray + `  😴 No buy signals or budget limited.`.padEnd(100) + sumBorder + `║` + colors.reset);
        }
        console.log(sumBorder + `╚` + `═`.repeat(100) + `╝` + colors.reset + `\n`);
        
    } catch (error) {
        console.error("❌ Analysis failed:", error.message);
    }
}

runRealAnalysis();
