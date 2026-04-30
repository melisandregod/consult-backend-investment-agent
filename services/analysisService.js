import { RSI, EMA } from 'technicalindicators';
import { getClosedRows } from '../utils/math.js';
import { getMarketInfo } from './marketDataService.js';

/**
 * Core decision logic for investment scoring.
 * 
 * @param {Object} params
 * @param {number} params.price Current price
 * @param {number[]} params.closes Historical close prices
 * @param {number} params.avg_cost Average cost from portfolio
 * @param {number} params.current_alloc Current allocation (0 to 1)
 * @param {number} params.target_alloc Target allocation (0 to 1)
 * @param {number} params.fng Fear and Greed index (0 to 100)
 * @param {number} params.budget Available budget
 * @param {Array} params.history Full historical data rows
 * @returns {Object} Analysis result with score and action
 */
export function computeDecision({ price, closes, avg_cost, current_alloc, target_alloc, fng, budget = 0, history = null }) {
    let score = 0;
    let reasons = [];

    const avgCostAvailable = avg_cost > 0;
    const avgCostDiffAbs = avgCostAvailable ? (price - avg_cost) : null;
    const avgCostDiffPct = avgCostAvailable ? ((price - avg_cost) / avg_cost) * 100 : null;
    const isAboveAvgCost = avgCostAvailable ? price > avg_cost : null;

    // 1. Technical (30%) - RSI & Trend
    const rsiArr = RSI.calculate({ values: closes, period: 14 });
    const emaArr = EMA.calculate({ values: closes, period: 200 });
    const rsi = rsiArr[rsiArr.length - 1];
    const ema200 = emaArr[emaArr.length - 1];
    if (rsi == null || ema200 == null) {
        return { score: 0, reasons: ["⚠️ Insufficient indicator data"], action: "WAIT", recommend_usd: 0, status: "Insufficient Data" };
    }

    // 1.1 Volume Shock (20-day)
    let volumeShockPct = null;
    let volumeShock = null;
    if (history && history.length) {
        const closedRows = getClosedRows(history);
        const volumes = closedRows.map(h => h.volume).filter(v => v != null && v > 0);
        // Exclude the latest bar, which is often still in-progress during market hours.
        const finalizedVolumes = volumes.length > 1 ? volumes.slice(0, -1) : volumes;
        if (finalizedVolumes.length >= 21) {
            const lastVol = finalizedVolumes[finalizedVolumes.length - 1];
            const avg20 = finalizedVolumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
            if (avg20 > 0 && lastVol != null) {
                volumeShockPct = ((lastVol - avg20) / avg20) * 100;
                volumeShock = Math.abs(volumeShockPct) >= 50;
                volumeShockPct = Math.round(volumeShockPct * 100) / 100;
            }
        }
    }

    // 1.2 Distance from ATH
    const ath = Math.max(...closes);
    const distFromAthPct = ath > 0 ? Math.round((((price - ath) / ath) * 100) * 100) / 100 : null;

    // 1.3 Risk/Reward vs Support (60-day low)
    const validCloses = closes.filter(v => v != null && v > 0);
    const supportLookback = Math.min(60, validCloses.length);
    const support = supportLookback > 0 ? Math.min(...validCloses.slice(-supportLookback)) : null;
    const supportDistance = (support != null && support > 0) ? Math.round((price - support) * 100) / 100 : null;
    const downside = supportDistance != null ? supportDistance : null;
    const upside = Math.round(Math.abs(ema200 - price) * 100) / 100;
    const riskRewardRatio = (downside != null && downside > 0) ? Math.round((upside / downside) * 100) / 100 : null;

    // 2. Valuation (30%) - เทียบกับกราฟ (EMA200)
    const priceDiff = ((price - ema200) / ema200) * 100;
    if (priceDiff < -5) { score += 30; reasons.push(`✅ Below EMA200 >5% (${priceDiff.toFixed(1)}%)`); }
    else if (priceDiff < 0) { score += 20; reasons.push(`✅ Below EMA200 (${priceDiff.toFixed(1)}%)`); }
    else if (priceDiff < 10) { score += 10; reasons.push(`⚠️ Slightly Above EMA200 (+${priceDiff.toFixed(1)}%)`); }
    else { reasons.push(`❌ Over EMA200 (+${priceDiff.toFixed(1)}%)`); }

    if (rsi < 30) { score += 15; reasons.push(`✅ RSI Oversold (${rsi.toFixed(0)})`); }
    else if (rsi < 50) { score += 10; reasons.push(`⚠️ RSI Low (${rsi.toFixed(0)})`); }

    if (price > ema200) { score += 15; reasons.push("✅ Uptrend (Above EMA200)"); }
    else { reasons.push("⚠️ Downtrend (Below EMA200)"); }

    // 3. Sentiment (20%) - Fear & Greed
    if (fng < 25) { score += 20; reasons.push(`✅ Extreme Fear (${fng})`); }
    else if (fng < 45) { score += 10; reasons.push(`⚠️ Market Fear (${fng})`); }

    // 4. Allocation (20%) - วินัยตามเป้าหมาย
    const allocGap = (target_alloc - current_alloc) * 100;
    if (allocGap > 5) { 
        score += 20; 
        reasons.push(`✅ Below Target >5% (Gap: ${allocGap.toFixed(1)}%)`); 
    } else if (allocGap > 0) {
        score += 10;
        reasons.push(`⚠️ Below Target (Gap: ${allocGap.toFixed(1)}%)`);
    }

    let action = "WAIT";
    let rec_usd = 0;
    if (score >= 85) { action = "STRONG_BUY 🚀"; rec_usd = budget + 100; }
    else if (score >= 60) { action = "BUY ✅"; rec_usd = budget; }
    else if (score >= 40) { action = "ACCUMULATE ⚠️"; rec_usd = budget * 0.5; }

    return {
        score,
        reasons,
        action,
        recommend_usd: Math.round(rec_usd),
        avg_cost_available: avgCostAvailable,
        avg_cost_diff_abs: avgCostAvailable ? Math.round(avgCostDiffAbs * 100) / 100 : null,
        avg_cost_diff_pct: avgCostAvailable ? Math.round(avgCostDiffPct * 100) / 100 : null,
        is_above_avg_cost: isAboveAvgCost,
        rsi: Math.round(rsi * 100) / 100,
        ema200: Math.round(ema200 * 100) / 100,
        volume_shock_pct: volumeShockPct,
        volume_shock: volumeShock,
        dist_from_ath_pct: distFromAthPct,
        support_distance: supportDistance,
        risk_reward_ratio: riskRewardRatio
    };
}

/**
 * High-level analysis for a single asset.
 */
export async function analyze(asset, budget, fng, marketInfo = null, currentAllocOverride = null) {
    const { symbol, avg_cost, current_alloc, target_alloc, qty } = asset;
    const { price, closes, history } = marketInfo || await getMarketInfo(symbol);

    if (price === 0 || closes.length < 200) return { symbol, status: "Insufficient Data" };

    const effectiveCurrentAlloc = currentAllocOverride != null ? currentAllocOverride : current_alloc;
    const decision = computeDecision({ price, closes, avg_cost, current_alloc: effectiveCurrentAlloc, target_alloc, fng, budget, history });
    if (decision.status === "Insufficient Data") return { symbol, status: "Insufficient Data" };

    const allocation_current_pct = Math.round(effectiveCurrentAlloc * 10000) / 100;
    const allocation_target_pct = Math.round(target_alloc * 10000) / 100;
    const allocation_gap_pct = Math.round((allocation_target_pct - allocation_current_pct) * 100) / 100;

    const sparkline = closes.slice(-30).map(v => Math.round(v * 100) / 100);

    return {
        symbol,
        price,
        qty,
        market_value: Math.round((price * (qty || 0)) * 100) / 100,
        score: decision.score,
        action: decision.action,
        reasons: decision.reasons,
        allocation_current_pct,
        allocation_target_pct,
        allocation_gap_pct,
        avg_cost_available: decision.avg_cost_available,
        avg_cost_diff_abs: decision.avg_cost_diff_abs,
        avg_cost_diff_pct: decision.avg_cost_diff_pct,
        is_above_avg_cost: decision.is_above_avg_cost,
        rsi: decision.rsi,
        ema200: decision.ema200,
        volume_shock_pct: decision.volume_shock_pct,
        volume_shock: decision.volume_shock,
        dist_from_ath_pct: decision.dist_from_ath_pct,
        support_distance: decision.support_distance,
        risk_reward_ratio: decision.risk_reward_ratio,
        sparkline
    };
}
