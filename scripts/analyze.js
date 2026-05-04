import { getPortfolioSummary, getRemainingBudget } from '../services/portfolioService.js';
import { getCryptoFearGreed, getUsMarketFearGreed, getMarketInfo, isCryptoSymbol } from '../services/marketDataService.js';
import { analyze, distributeBudget } from '../services/analysisService.js';
import { getUsdThbRate } from '../services/currencyService.js';
import { extractCloseSeries } from '../utils/math.js';
import dotenv from 'dotenv';

dotenv.config();

async function runRealAnalysis() {
    console.log("🚀 Starting real-world analysis...");
    
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

        // 1. Pre-fetch market info for all assets to calculate total portfolio value
        console.log("⏳ Fetching market prices...");
        const marketInfos = await Promise.all(portfolio.map(a => getMarketInfo(a.symbol)));
        const marketValues = marketInfos.map((m, i) => (m.price || 0) * (portfolio[i].qty || 0));
        const totalMarketValue = marketValues.reduce((sum, v) => sum + v, 0);

        // 2. Analyze each asset with accurate allocation %
        const preliminaryAnalysis = [];
        for (let i = 0; i < portfolio.length; i++) {
            const asset = portfolio[i];
            const marketInfo = marketInfos[i];
            const fng = isCryptoSymbol(asset.symbol) ? cryptoFng : usFng;
            
            console.log(`\n--- Analyzing ${asset.symbol} ---`);
            
            // Calculate current allocation by actual current value
            const currentAllocByValue = totalMarketValue > 0 ? (marketValues[i] / totalMarketValue) : asset.current_alloc;
            
            const result = await analyze(asset, budget, fng, marketInfo, currentAllocByValue);
            
            console.log(`Price: $${result.price}`);
            console.log(`Current Allocation: ${result.allocation_current_pct}% (Target: ${result.allocation_target_pct}%)`);
            console.log(`Score: ${result.score}`);
            console.log(`Action: ${result.action}`);
            console.log(`Reasons: ${result.reasons.join(' | ')}`);
            preliminaryAnalysis.push(result);
        }

        // 3. Smart Budget Distribution
        const results = distributeBudget(preliminaryAnalysis, portfolio, budget, totalMarketValue);

        // --- FINAL SUMMARY ---
        console.log("\n" + "=".repeat(50));
        console.log("📈 INVESTMENT SUMMARY REPORT");
        console.log("=".repeat(50));
        
        let totalValue = 0;
        const buyOrders = [];
        
        for (const r of results) {
            totalValue += r.market_value;
            if (r.recommend_usd > 0) {
                buyOrders.push(r);
            }
        }

        console.log(`Total Portfolio Value: $${totalValue.toFixed(2)}`);
        console.log(`Remaining Budget:    $${budget.toFixed(2)}`);
        
        if (buyOrders.length > 0) {
            console.log("\n🎯 Top Buy Recommendations for today:");
            // Sort by recommend_usd descending
            buyOrders.sort((a, b) => b.recommend_usd - a.recommend_usd);
            for (const order of buyOrders) {
                console.log(`- ${order.symbol.padEnd(6)}: Recommend $${order.recommend_usd.toString().padEnd(5)} | Score ${order.score} [${order.action}]`);
            }
        } else {
            console.log("\n😴 No strong buy signals or budget limited. Holding cash is recommended.");
        }
        console.log("=".repeat(50));
        
    } catch (error) {
        console.error("❌ Analysis failed:", error.message);
    }
}

runRealAnalysis();
