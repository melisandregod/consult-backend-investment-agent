import { getPortfolioSummary } from '../../services/portfolioService.js';
import { getMarketInfo } from '../../services/marketDataService.js';
import dotenv from 'dotenv';

dotenv.config();

async function runComparison() {
    console.log("📊 Fetching portfolio and S&P 500 data...");

    try {
        const portfolio = await getPortfolioSummary();
        const marketInfos = await Promise.all(portfolio.map(a => getMarketInfo(a.symbol)));
        
        // Fetch S&P 500 data (^GSPC)
        const sp500Info = await getMarketInfo('^GSPC', { days: 365 });
        const sp500Current = sp500Info.price;
        
        // S&P 500 Performance (1 Year)
        const sp500OneYearAgo = sp500Info.closes[0];
        const sp500OneYearReturn = ((sp500Current / sp500OneYearAgo) - 1) * 100;

        // S&P 500 Performance (YTD)
        // Approximate YTD by finding the first price of the current year
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const ytdHistory = sp500Info.history.filter(h => new Date(h.date) >= startOfYear);
        const sp500YTDStart = ytdHistory.length > 0 ? ytdHistory[0].close : sp500OneYearAgo;
        const sp500YTDReturn = ((sp500Current / sp500YTDStart) - 1) * 100;

        let totalInvestment = 0;
        let totalMarketValue = 0;

        console.log("\nAsset Breakdown:");
        console.log("Symbol | Avg Cost | Current | Return %");
        console.log("-".repeat(40));

        portfolio.forEach((asset, i) => {
            const currentPrice = marketInfos[i].price;
            const investment = asset.avg_cost * asset.qty;
            const marketValue = currentPrice * asset.qty;
            const assetReturn = ((currentPrice / asset.avg_cost) - 1) * 100;

            totalInvestment += investment;
            totalMarketValue += marketValue;

            console.log(`${asset.symbol.padEnd(6)} | $${asset.avg_cost.toFixed(2).padEnd(8)} | $${currentPrice.toFixed(2).padEnd(7)} | ${assetReturn.toFixed(2)}%`);
        });

        const totalReturn = ((totalMarketValue / totalInvestment) - 1) * 100;
        const totalPnL = totalMarketValue - totalInvestment;

        console.log("\n" + "=".repeat(40));
        console.log("🏆 PERFORMANCE COMPARISON");
        console.log("=".repeat(40));
        console.log(`Your Portfolio Return:   ${totalReturn.toFixed(2)}% (+$${totalPnL.toFixed(2)})`);
        console.log(`S&P 500 YTD Return:      ${sp500YTDReturn.toFixed(2)}%`);
        console.log(`S&P 500 1-Year Return:   ${sp500OneYearReturn.toFixed(2)}%`);
        console.log("=".repeat(40));

        if (totalReturn > sp500YTDReturn) {
            console.log("🚀 Congratulations! You are OUTPERFORMING the S&P 500 (YTD).");
        } else {
            console.log("📉 You are currently trailing the S&P 500 (YTD).");
        }

    } catch (error) {
        console.error("❌ Comparison failed:", error);
    }
}

runComparison();
