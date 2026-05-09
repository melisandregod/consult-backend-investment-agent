import express from 'express';
import { getPortfolioSummary, getRemainingBudget, getTransactions } from '../services/portfolioService.js';
import { getCryptoFearGreed, getUsMarketFearGreed, getMarketInfo, isCryptoSymbol } from '../services/marketDataService.js';
import { analyze, distributeBudget, calculateRebalance } from '../services/analysisService.js';
import { getUsdThbRate } from '../services/currencyService.js';

const router = express.Router();

router.get('/api/transactions', async (req, res) => {
    try {
        const transactions = await getTransactions();
        res.json(transactions);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

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
                price_thb: Math.round(analysis.price * exchangeRate * 100) / 100,
                recommend_thb: Math.round(analysis.recommend_usd * exchangeRate),
                rebalance_diff_thb: Math.round(analysis.rebalance_diff_usd * exchangeRate * 100) / 100
            };
        });

        const currentMonth = new Date().getMonth() + 1;
        const rebalanceMonths = [3, 6, 9, 12];
        const isRebalanceMonth = rebalanceMonths.includes(currentMonth);
        
        let monthsUntilRebalance = 0;
        if (!isRebalanceMonth) {
            const nextRebalanceMonth = rebalanceMonths.find(m => m > currentMonth) || 3;
            monthsUntilRebalance = nextRebalanceMonth > currentMonth 
                ? nextRebalanceMonth - currentMonth 
                : (12 - currentMonth) + nextRebalanceMonth;
        }

        res.json({
            budget_remaining: budget,
            exchange_rate: exchangeRate,
            is_rebalance_month: isRebalanceMonth,
            months_until_rebalance: monthsUntilRebalance,
            total_market_value: Math.round(totalMarketValue * 100) / 100,
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
        
        const marketInfos = await Promise.all(portfolio.map(a => getMarketInfo(a.symbol, { includeQuote: false })));
        const marketValues = marketInfos.map((m, i) => (m.price || 0) * (portfolio[i].qty || 0));
        const totalMarketValue = marketValues.reduce((sum, v) => sum + v, 0);

        res.json({
            total_market_value: Math.round(totalMarketValue * 100) / 100,
            budget_remaining: budget,
            asset_count: portfolio.length
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
