import express from 'express';
import { getPortfolioSummary, getRemainingBudget } from '../services/portfolioService.js';
import { getCryptoFearGreed, getUsMarketFearGreed, getMarketInfo, isCryptoSymbol } from '../services/marketDataService.js';
import { analyze, distributeBudget, calculateRebalance } from '../services/analysisService.js';
import { getUsdThbRate } from '../services/currencyService.js';

const router = express.Router();

router.get('/analyze', async (req, res) => {
    try {
        const [portfolio, budget, exchangeRate] = await Promise.all([
            getPortfolioSummary(), getRemainingBudget(), getUsdThbRate()
        ]);
        
        const marketInfos = await Promise.all(portfolio.map(a => getMarketInfo(a.symbol)));
        const marketValues = marketInfos.map((m, i) => (m.price || 0) * (portfolio[i].qty || 0));
        const totalMarketValue = marketValues.reduce((sum, v) => sum + v, 0);
        const totalPortfolioValue = totalMarketValue + Math.max(0, budget);

        const preliminaryAnalysis = await Promise.all(portfolio.map(async (a, i) => {
            const currentAllocByValue = totalMarketValue > 0 ? (marketValues[i] / totalMarketValue) : (a.current_alloc || 0);
            return await analyze(a, budget, marketInfos[i], currentAllocByValue);
        }));

        const analyzedResults = distributeBudget(preliminaryAnalysis, portfolio, budget);
        const rebalancedResults = calculateRebalance(analyzedResults, totalPortfolioValue);

        const results = rebalancedResults.map((analysis, i) => {
            const asset = portfolio[i];
            const cost = asset.spentValue || 0;
            const gainLossUsd = (analysis.market_value || 0) - cost;
            const gainLossPct = cost > 0 ? (gainLossUsd / cost) * 100 : 0;

            return {
                ...analysis,
                type: asset.type,
                cost_usd: Math.round(cost * 100) / 100,
                gain_loss_usd: Math.round(gainLossUsd * 100) / 100,
                gain_loss_pct: Math.round(gainLossPct * 100) / 100,
                market_value_thb: Math.round(analysis.market_value * exchangeRate * 100) / 100,
                recommend_thb: Math.round(analysis.recommend_usd * exchangeRate),
                rebalance_diff_thb: Math.round(analysis.rebalance_diff_usd * exchangeRate * 100) / 100
            };
        });

        const currentMonth = new Date().getMonth() + 1;
        const isRebalanceMonth = [3, 6, 9, 12].includes(currentMonth);

        res.json({
            budget_remaining: budget,
            is_rebalance_month: isRebalanceMonth,
            total_market_value: Math.round(totalMarketValue * 100) / 100,
            analysis: results
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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
