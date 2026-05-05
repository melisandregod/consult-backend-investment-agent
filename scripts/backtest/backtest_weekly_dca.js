import dotenv from 'dotenv';
import { getPortfolioSummary } from '../../services/portfolioService.js';
import { getHistoricalSafe } from '../../services/marketDataService.js';
import { computeDecision, distributeBudget } from '../../services/analysisService.js';
import { extractCloseSeries } from '../../utils/math.js';

dotenv.config();

async function runWeeklyDcaBacktest() {
    const years = parseInt(process.argv[2]) || 5;
    const monthlyBudget = parseFloat(process.argv[3]) || 300;
    const weeklyBudget = monthlyBudget / 4;

    console.log(`📊 Starting Weekly Selective DCA Backtest: $${weeklyBudget} per Week ($${monthlyBudget}/mo)`);
    console.log(`⏳ Period: Last ${years} Years\n`);

    try {
        const portfolio = await getPortfolioSummary();
        const assets = portfolio.filter(a => a.target_alloc > 0);
        console.log(`✅ Loaded ${assets.length} assets.`);

        const now = new Date();
        const startDate = new Date();
        startDate.setFullYear(now.getFullYear() - years);
        startDate.setMonth(startDate.getMonth() - 12);

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

        // Generate Weekly Buy Dates (4 times a month: 7, 14, 21, 28)
        const buyDates = [];
        const totalMonths = years * 12;
        for (let i = totalMonths - 1; i >= 0; i--) {
            const baseDate = new Date();
            baseDate.setMonth(now.getMonth() - i);
            
            [7, 14, 21, 28].forEach(day => {
                const d = new Date(baseDate);
                d.setDate(day);
                if (d <= now) buyDates.push(new Date(d));
            });
        }
        buyDates.sort((a, b) => a - b);

        let cash = 0;
        let totalInvested = 0;
        let maxPortfolioValue = 0;
        let maxDrawdown = 0;
        const holdings = {};
        assets.forEach(a => holdings[a.symbol] = { qty: 0, avg_cost: 0 });

        for (const buyDate of buyDates) {
            cash += weeklyBudget;
            totalInvested += weeklyBudget;
            
            const currentPrices = {};
            const analysisResults = [];

            let portfolioValue = cash;
            for (const asset of assets) {
                const history = assetHistories[asset.symbol];
                const dayData = history?.filter(h => new Date(h.date) <= buyDate).pop();
                if (dayData) {
                    currentPrices[asset.symbol] = dayData.close;
                    portfolioValue += holdings[asset.symbol].qty * dayData.close;
                }
            }

            if (portfolioValue > maxPortfolioValue) {
                maxPortfolioValue = portfolioValue;
            } else if (maxPortfolioValue > 0) {
                const drawdown = (portfolioValue - maxPortfolioValue) / maxPortfolioValue;
                if (drawdown < maxDrawdown) maxDrawdown = drawdown;
            }

            for (const asset of assets) {
                const history = assetHistories[asset.symbol];
                const slice = history?.filter(h => new Date(h.date) <= buyDate);
                if (!slice || slice.length < 200) continue;

                const price = currentPrices[asset.symbol];
                const closes = extractCloseSeries(slice);
                const current_alloc = portfolioValue > 0 ? (holdings[asset.symbol].qty * price) / portfolioValue : 0;
                
                const decision = computeDecision({
                    price,
                    closes,
                    avg_cost: holdings[asset.symbol].avg_cost,
                    current_alloc,
                    target_alloc: asset.target_alloc,
                    fng: 50,
                    budget: weeklyBudget, 
                    history: slice
                });

                analysisResults.push({
                    symbol: asset.symbol,
                    price,
                    score: decision.score,
                    action: decision.action,
                    allocation_current_pct: current_alloc * 100
                });
            }

            const distributedResults = distributeBudget(analysisResults, assets, cash, portfolioValue);
            let targets = distributedResults.filter(r => r.recommend_usd > 0);
            
            for (const res of targets) {
                const buyUsd = Math.min(res.recommend_usd, cash);
                if (buyUsd <= 0) continue;
                const buyQty = buyUsd / res.price;
                const h = holdings[res.symbol];
                const totalCost = (h.qty * h.avg_cost) + buyUsd;
                h.qty += buyQty;
                h.avg_cost = totalCost / h.qty;
                cash -= buyUsd;
            }
        }

        console.log("--------------------------------------------------");
        console.log(`🏆 WEEKLY SELECTIVE DCA SUMMARY (${years} YEARS)`);
        console.log("--------------------------------------------------");
        
        let finalValue = cash;
        for (const asset of assets) {
            const h = holdings[asset.symbol];
            const history = assetHistories[asset.symbol];
            const finalPrice = history[history.length - 1].close;
            finalValue += h.qty * finalPrice;
            const profitPct = h.qty > 0 ? ((finalPrice - h.avg_cost) / h.avg_cost) * 100 : 0;
            console.log(`- ${asset.symbol.padEnd(6)}: Profit: ${profitPct.toFixed(1).padStart(6)}% | Value: $${(h.qty * finalPrice).toFixed(2)}`);
        }

        const totalProfitPct = ((finalValue - totalInvested) / totalInvested) * 100;
        const cagr = (Math.pow(finalValue / totalInvested, 1 / years) - 1) * 100;

        console.log("--------------------------------------------------");
        console.log(`Total Invested:   $${totalInvested.toFixed(2)}`);
        console.log(`Final Value:      $${finalValue.toFixed(2)}`);
        console.log(`Net Profit/Loss:  ${totalProfitPct.toFixed(2)}%`);
        console.log(`Annualized Rate:  ${cagr.toFixed(2)}% (CAGR)`);
        console.log(`Max Drawdown:     ${(maxDrawdown * 100).toFixed(2)}%`);
        console.log(`Remaining Cash:   $${cash.toFixed(2)}`);
        console.log("--------------------------------------------------\n");

    } catch (error) {
        console.error("❌ Backtest failed:", error);
    }
}

runWeeklyDcaBacktest();
