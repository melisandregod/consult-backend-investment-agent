import { getPortfolioSummary, getRemainingBudget } from '../services/portfolioService.js';
import { getCryptoFearGreed, getUsMarketFearGreed, getMarketInfo, isCryptoSymbol } from '../services/marketDataService.js';
import { analyze, distributeBudget, calculateRebalance } from '../services/analysisService.js';
import { getUsdThbRate } from '../services/currencyService.js';
import { extractCloseSeries } from '../utils/math.js';
import dotenv from 'dotenv';

dotenv.config();

async function runRealAnalysis() {
    console.log("🚀 Fetching DCA & Portfolio Status...");
    
    try {
        const [portfolio, budget] = await Promise.all([
            getPortfolioSummary(), getRemainingBudget()
        ]);
        
        console.log(`📊 Found ${portfolio.length} assets in portfolio.`);
        console.log(`💰 Remaining Budget: $${budget}`);

        const [cryptoFng, usFng] = await Promise.all([
            getCryptoFearGreed(), getUsMarketFearGreed()
        ]);
        
        console.log(`🌡️ Fear & Greed: Crypto=${cryptoFng}, US Market=${usFng}`);

        // Quarterly Logic: March, June, September, December
        const currentMonth = new Date().getMonth() + 1; // 1-12
        const rebalanceMonths = [3, 6, 9, 12];
        const isRebalanceMonth = rebalanceMonths.includes(currentMonth);
        
        // Calculate months until next rebalance
        let monthsUntilRebalance = 0;
        if (!isRebalanceMonth) {
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
        const distributedResults = distributeBudget(preliminaryAnalysis, portfolio, budget);
        const finalResults = calculateRebalance(distributedResults, totalPortfolioValue);

        // --- QUARTERLY REBALANCE SECTION ---
        console.log("\n" + "=".repeat(50));
        if (isRebalanceMonth) {
            console.log("🔔 QUARTERLY REBALANCE ALERT: IT'S TIME! (MAR/JUN/SEP/DEC)");
            console.log("=".repeat(50));
            
            // Financial Verification
            let totalToSell = 0;
            let totalToBuy = 0;
            
            finalResults.forEach(r => {
                if (r.rebalance_diff_usd < 0) totalToSell += Math.abs(r.rebalance_diff_usd);
                else totalToBuy += r.rebalance_diff_usd;
            });

            console.log("Recommended actions to keep portfolio in balance:");
            console.log(`Symbol | Action      | Amount (USD) | Target %`);
            console.log("-".repeat(50));
            
            finalResults.forEach(r => {
                const actionStr = r.rebalance_action === "SELL" ? "SELL (Trim) " : "BUY (Add)   ";
                const significantMarker = r.is_rebalance_significant ? "⚠️" : " ";
                console.log(`${r.symbol.padEnd(6)} | ${actionStr} | $${Math.abs(r.rebalance_diff_usd).toString().padEnd(10)} | ${r.allocation_target_pct.toFixed(1)}% ${significantMarker}`);
            });

            console.log("-".repeat(50));
            console.log(`💵 CASH FLOW SUMMARY:`);
            console.log(`Total Proceeds from Selling:  $${totalToSell.toFixed(2)}`);
            console.log(`Current Monthly Budget:       $${budget.toFixed(2)}`);
            console.log(`Total Available for Buying:   $${(totalToSell + budget).toFixed(2)}`);
            console.log(`Total Needed for Buying:      $${totalToBuy.toFixed(2)}`);
            
            const netDiff = (totalToSell + budget) - totalToBuy;
            if (Math.abs(netDiff) < 1) {
                console.log(`✅ Financial Integrity Check: PASSED (Balanced)`);
            } else {
                console.log(`❌ Financial Integrity Check: FAILED (Gap: $${netDiff.toFixed(2)})`);
            }
        } else {
            console.log(`📅 NEXT REBALANCE IN: ${monthsUntilRebalance} MONTH(S)`);
            const nextMonthName = new Date(0, rebalanceMonths.find(m => m > currentMonth || 3) - 1).toLocaleString('en-US', { month: 'long' });
            console.log(`Next scheduled rebalance: ${nextMonthName}`);
        }
        console.log("=".repeat(50));

        // --- FINAL SUMMARY ---
        console.log("\n" + "=".repeat(50));
        console.log("📈 DCA RECOMMENDATION REPORT");
        console.log("=".repeat(50));
        
        let totalValue = 0;
        const buyOrders = finalResults.filter(r => r.recommend_usd > 0);
        
        finalResults.forEach(r => {
            totalValue += (r.market_value || 0);
        });

        console.log(`Total Portfolio Value: $${totalValue.toFixed(2)}`);
        console.log(`Remaining Budget:    $${budget.toFixed(2)}`);
        
        if (buyOrders.length > 0 && !isRebalanceMonth) {
            console.log("\n🎯 Top Buy Recommendations for today:");
            // Sort by recommend_usd descending
            buyOrders.sort((a, b) => b.recommend_usd - a.recommend_usd);
            for (const order of buyOrders) {
                console.log(`- ${order.symbol.padEnd(6)}: Recommend $${order.recommend_usd.toString().padEnd(5)} [DCA Allocation]`);
            }
        } else if (!isRebalanceMonth) {
            console.log("\n😴 No buy signals or budget limited.");
        }
        console.log("=".repeat(50));
        
    } catch (error) {
        console.error("❌ Analysis failed:", error.message);
    }
}

runRealAnalysis();
