import express from 'express';
import { getPortfolioSummary, getRemainingBudget } from '../services/portfolioService.js';
import { getCryptoFearGreed, getUsMarketFearGreed, getMarketInfo, isCryptoSymbol } from '../services/marketDataService.js';
import { analyze } from '../services/analysisService.js';
import { getUsdThbRate } from '../services/currencyService.js';

const router = express.Router();

router.get('/analyze', async (req, res) => {
    try {
        const [portfolio, budget, exchangeRate] = await Promise.all([
            getPortfolioSummary(), getRemainingBudget(), getUsdThbRate()
        ]);
        const [cryptoFng, usFng] = await Promise.all([
            getCryptoFearGreed(), getUsMarketFearGreed()
        ]);
        
        const marketInfos = await Promise.all(portfolio.map(a => getMarketInfo(a.symbol)));
        const marketValues = marketInfos.map((m, i) => (m.price || 0) * (portfolio[i].qty || 0));
        const totalMarketValue = marketValues.reduce((sum, v) => sum + v, 0);

        let totalCostUsd = 0;
        const allocationByType = {
            STOCK: { current: 0, target: 0 },
            CRYPTO: { current: 0, target: 0 }
        };

        const results = await Promise.all(portfolio.map(async (a, i) => {
            const currentAllocByValue = totalMarketValue > 0 ? (marketValues[i] / totalMarketValue) : a.current_alloc;
            const fng = isCryptoSymbol(a.symbol) ? cryptoFng : usFng;
            
            const analysis = await analyze(a, budget, fng, marketInfos[i], currentAllocByValue);
            
            const effectiveRecUsd = budget > 0 ? analysis.recommend_usd : 0;
            const cost = a.spentValue || 0;
            totalCostUsd += cost;

            // Group by type for allocation summary
            const aType = a.type === 'CRYPTO' ? 'CRYPTO' : 'STOCK';
            allocationByType[aType].current += (analysis.market_value || 0);
            allocationByType[aType].target += (a.target_alloc * totalMarketValue);

            const gainLossUsd = (analysis.market_value || 0) - cost;
            const gainLossPct = cost > 0 ? (gainLossUsd / cost) * 100 : 0;

            return {
                ...analysis,
                type: a.type,
                cost_usd: Math.round(cost * 100) / 100,
                cost_thb: Math.round(cost * exchangeRate * 100) / 100,
                gain_loss_usd: Math.round(gainLossUsd * 100) / 100,
                gain_loss_thb: Math.round(gainLossUsd * exchangeRate * 100) / 100,
                gain_loss_pct: Math.round(gainLossPct * 100) / 100,
                recommend_usd: effectiveRecUsd,
                price_thb: Math.round(analysis.price * exchangeRate * 100) / 100,
                market_value_thb: Math.round(analysis.market_value * exchangeRate * 100) / 100,
                recommend_thb: effectiveRecUsd ? Math.round(effectiveRecUsd * exchangeRate) : 0,
                is_budget_limited: budget <= 0 && analysis.score >= 40
            };
        }));

        const totalPlUsd = totalMarketValue - totalCostUsd;
        const totalPlPct = totalCostUsd > 0 ? (totalPlUsd / totalCostUsd) * 100 : 0;

        // Convert allocation to percentages
        const allocationStats = Object.keys(allocationByType).map(key => ({
            name: key,
            current: totalMarketValue > 0 ? Math.round((allocationByType[key].current / totalMarketValue) * 100) : 0,
            target: totalMarketValue > 0 ? Math.round((allocationByType[key].target / totalMarketValue) * 100) : 0,
            value_usd: Math.round(allocationByType[key].current * 100) / 100
        }));

        let budgetStatus = "AVAILABLE";
        if (budget <= 0) budgetStatus = "EXHAUSTED";
        if (budget < -10) budgetStatus = "OVERSPENT";

        res.json({
            budget_remaining: budget,
            budget_remaining_thb: Math.round(budget * exchangeRate * 100) / 100,
            budget_status: budgetStatus,
            exchange_rate: exchangeRate,
            fear_greed_crypto: cryptoFng,
            fear_greed_us: usFng,
            total_market_value: Math.round(totalMarketValue * 100) / 100,
            total_market_value_thb: Math.round(totalMarketValue * exchangeRate * 100) / 100,
            total_cost_usd: Math.round(totalCostUsd * 100) / 100,
            total_cost_thb: Math.round(totalCostUsd * exchangeRate * 100) / 100,
            total_pl_usd: Math.round(totalPlUsd * 100) / 100,
            total_pl_thb: Math.round(totalPlUsd * exchangeRate * 100) / 100,
            total_pl_pct: Math.round(totalPlPct * 100) / 100,
            allocation_stats: allocationStats,
            analysis: results
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/api/summary', async (req, res) => {
    try {
        const [portfolio, budget] = await Promise.all([
            getPortfolioSummary(), getRemainingBudget()
        ]);
        const [cryptoFng, usFng] = await Promise.all([
            getCryptoFearGreed(), getUsMarketFearGreed()
        ]);
        
        const marketInfos = await Promise.all(portfolio.map(a => getMarketInfo(a.symbol, { includeQuote: false })));
        const marketValues = marketInfos.map((m, i) => (m.price || 0) * (portfolio[i].qty || 0));
        const totalMarketValue = marketValues.reduce((sum, v) => sum + v, 0);

        const buySignals = []; // Simple count for summary
        
        res.json({
            total_market_value: Math.round(totalMarketValue * 100) / 100,
            budget_remaining: budget,
            fear_greed_crypto: cryptoFng,
            fear_greed_us: usFng,
            asset_count: portfolio.length
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
