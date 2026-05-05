import { getMarketInfo } from './marketDataService.js';

/**
 * BLIND DCA Core Logic: Only focuses on target weights and allocation gaps.
 */
export function computeDecision({ current_alloc, target_alloc }) {
    const allocGap = (target_alloc - current_alloc) * 100;
    
    return {
        action: allocGap > 0 ? "BUY" : "HOLD",
        allocation_gap_pct: Math.round(allocGap * 100) / 100
    };
}

/**
 * Calculates exact rebalance actions to reach target weights.
 */
export function calculateRebalance(analysisResults, totalPortfolioValue) {
    return analysisResults.map(res => {
        const targetUsd = totalPortfolioValue * (res.allocation_target_pct / 100);
        const currentUsd = res.market_value;
        const diffUsd = targetUsd - currentUsd;

        // Threshold: Significant if deviation > 5% of target amount
        const isSignificant = Math.abs(diffUsd) > (targetUsd * 0.05);

        return {
            ...res,
            rebalance_target_usd: Math.round(targetUsd * 100) / 100,
            rebalance_diff_usd: Math.round(diffUsd * 100) / 100,
            rebalance_action: diffUsd > 0 ? "BUY" : "SELL",
            is_rebalance_significant: isSignificant
        };
    });
}

/**
 * Clean Analysis for a single asset.
 */
export async function analyze(asset, budget, marketInfo = null, currentAllocOverride = null) {
    const { symbol, target_alloc, qty } = asset;
    const { price } = marketInfo || await getMarketInfo(symbol);

    if (price === 0) return { symbol, status: "Insufficient Data" };

    const effectiveCurrentAlloc = currentAllocOverride != null ? currentAllocOverride : (asset.current_alloc || 0);
    const decision = computeDecision({ current_alloc: effectiveCurrentAlloc, target_alloc });

    const allocation_current_pct = Math.round(effectiveCurrentAlloc * 10000) / 100;
    const allocation_target_pct = Math.round(target_alloc * 10000) / 100;

    return {
        symbol,
        price,
        qty,
        market_value: Math.round((price * (qty || 0)) * 100) / 100,
        action: decision.action,
        allocation_current_pct,
        allocation_target_pct,
        allocation_gap_pct: decision.allocation_gap_pct
    };
}

/**
 * Strictly distributes budget based on target weights.
 */
export function distributeBudget(analysisResults, portfolio, budget) {
    if (budget <= 0) return analysisResults.map(r => ({ ...r, recommend_usd: 0 }));

    const totalTargetWeight = portfolio.reduce((sum, a) => sum + (a.target_alloc || 0), 0);

    return analysisResults.map(analysis => {
        const asset = portfolio.find(a => a.symbol === analysis.symbol);
        if (!asset || totalTargetWeight <= 0) return { ...analysis, recommend_usd: 0 };

        const recommend_usd = Math.round(budget * (asset.target_alloc / totalTargetWeight));

        return { ...analysis, recommend_usd };
    });
}
