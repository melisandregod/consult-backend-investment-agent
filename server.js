import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import YahooFinance from 'yahoo-finance2';
import { RSI, EMA } from 'technicalindicators';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const yahooFinance = new YahooFinance({
    suppressNotices: ["ripHistorical", "yahooSurvey"],
    validation: {
        // Keep schema validation enabled, but avoid noisy logs from intermittent Yahoo payload issues.
        logErrors: false,
    },
});
const app = express();
app.use(cors());
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3001', 10);
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SERVICE_ACCOUNT_FILE = process.env.GOOGLE_SERVICE_ACCOUNT || 'service_account.json';
const TARGET_CRYPTO_SYMBOLS = (process.env.TARGET_CRYPTO_SYMBOLS || 'BTC').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
const TARGET_CRYPTO_PCT = parseFloat(process.env.TARGET_CRYPTO_PCT || '30');
const TARGET_STOCK_TOTAL_PCT = parseFloat(process.env.TARGET_STOCK_TOTAL_PCT || '70');
const TARGET_STOCK_COUNT = parseInt(process.env.TARGET_STOCK_COUNT || '7', 10);

if (!SPREADSHEET_ID) {
    throw new Error('Missing SPREADSHEET_ID in environment variables.');
}

const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_FILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'SOL'];

const isCryptoSymbol = (symbol = '') => {
    const s = symbol.trim().toUpperCase();
    return CRYPTO_SYMBOLS.includes(s) || s.endsWith('-USD');
};

const toFiniteNumber = (value) => {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

const normalizeHistoryRows = (rows) => {
    if (!Array.isArray(rows)) return [];
    return rows.filter(r => r && r.date).map(r => ({
        ...r,
        close: toFiniteNumber(r.close),
        adjclose: toFiniteNumber(r.adjclose),
        open: toFiniteNumber(r.open),
        high: toFiniteNumber(r.high),
        low: toFiniteNumber(r.low),
        volume: toFiniteNumber(r.volume)
    }));
};

const extractCloseSeries = (rows) => {
    return rows
        .map(r => toFiniteNumber(r.close ?? r.adjclose ?? r.open))
        .filter(v => v != null);
};

const getClosedRows = (rows) => {
    if (!Array.isArray(rows)) return [];
    // Use bars that have a settled close/adjclose to avoid partial-day distortions.
    return rows.filter(r => toFiniteNumber(r?.close ?? r?.adjclose) != null);
};

async function getChartHistorySafe(symbol, queryOptions) {
    const chartResult = await yahooFinance.chart(
        symbol,
        { ...queryOptions, return: 'array' },
        { validateResult: false }
    );
    return normalizeHistoryRows(chartResult?.quotes || []);
}

async function getHistoricalSafe(symbol, queryOptions) {
    try {
        // Prefer chart() because historical() currently logs noisy null-row diagnostics for some symbols.
        const chartRows = await getChartHistorySafe(symbol, queryOptions);
        if (chartRows.length > 0) return chartRows;
    } catch (error) {
        // Continue to historical fallback below.
    }

    try {
        return normalizeHistoryRows(await yahooFinance.historical(symbol, queryOptions));
    } catch (error) {
        // Fallback to unvalidated payload to tolerate Yahoo schema drift and edge-case payloads.
        const raw = await yahooFinance.historical(symbol, queryOptions, { validateResult: false });
        return normalizeHistoryRows(raw);
    }
}

async function getQuoteSafe(symbol) {
    try {
        return await yahooFinance.quote(symbol);
    } catch (error) {
        // Fallback to unvalidated payload to tolerate Yahoo schema drift and edge-case payloads.
        return await yahooFinance.quote(symbol, undefined, { validateResult: false });
    }
}

// Helper: ล้าง String ให้เป็นตัวเลข
const cleanNum = (val) => {
    if (!val) return 0;
    const cleaned = String(val).replace(/[^0-9.-]+/g, "");
    return parseFloat(cleaned) || 0;
};

async function getPortfolioSummary() {
    const client = await auth.getClient();
    const gs = google.sheets({ version: 'v4', auth: client });
    const res = await gs.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Portfolio_Summary!A1:Z' });
    const rows = res.data.values;
    if (!rows) return [];

    const headers = rows[0] || [];
    const dataRows = rows.slice(1);

    const findHeaderIndex = (patterns, fallbackIndex) => {
        const idx = headers.findIndex(h => {
            const header = String(h || '').toLowerCase();
            return patterns.some(p => header.includes(p));
        });
        return { index: idx >= 0 ? idx : fallbackIndex, found: idx >= 0 };
    };

    const avgCostInfo = findHeaderIndex(['avg cost', 'average cost', 'avg_cost', 'average_cost'], 4);
    const qtyInfo = findHeaderIndex(['total_qty', 'qty', 'quantity', 'total qty'], 2);
    const totalSpentInfo = findHeaderIndex(['total spent', 'total_spent', 'total_spent_usd', 'spent'], 3);

    const parsedRows = dataRows.map(r => {
        const symbol = String(r[0] || '').trim();
        const symbolKey = symbol.toUpperCase();
        const type = String(r[1] || '').trim().toUpperCase();
        const avg_cost = cleanNum(r[avgCostInfo.index]);
        const qty = cleanNum(r[qtyInfo.index]);
        const spentValue = cleanNum(r[totalSpentInfo.index]);
        return { symbol, symbolKey, type, avg_cost, qty, spentValue };
    });

    const tradableRows = parsedRows.filter(row => {
        if (!row.symbolKey) return false;
        if (row.symbolKey === 'TOTAL' || row.symbolKey === 'THB') return false;
        const isStockType = row.type === 'STOCK' || row.type === 'EQUITY' || row.type === 'US_STOCK';
        const isCryptoType = row.type === 'CRYPTO';
        const isKnownCrypto = TARGET_CRYPTO_SYMBOLS.includes(row.symbolKey) || row.symbolKey.endsWith('-USD');
        return isStockType || isCryptoType || isKnownCrypto;
    });

    const totalSpent = tradableRows.reduce((sum, r) => sum + r.spentValue, 0);

    return tradableRows.map(r => {
        const symbol = r.symbol;
        const type = r.type;
        const avg_cost = r.avg_cost;
        const qty = r.qty;

        const spentValue = r.spentValue;
        const current_alloc = totalSpent > 0 && spentValue > 0 ? (spentValue / totalSpent) : 0;

        const symbolKey = r.symbolKey;
        let target_alloc;
        if (TARGET_CRYPTO_SYMBOLS.includes(symbolKey) || type === 'CRYPTO') {
            target_alloc = TARGET_CRYPTO_PCT / 100;
        } else if (type === 'STOCK' || type === 'EQUITY' || type === 'US_STOCK') {
            target_alloc = TARGET_STOCK_COUNT > 0 ? (TARGET_STOCK_TOTAL_PCT / TARGET_STOCK_COUNT) / 100 : 0;
        } else {
            target_alloc = 0;
        }

        return { symbol, avg_cost, current_alloc, target_alloc, qty };
    }).filter(i => i.symbol);
}

async function getRemainingBudget() {
    const client = await auth.getClient();
    const gs = google.sheets({ version: 'v4', auth: client });
    const res = await gs.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Budget_Log!A2:D' });
    const rows = res.data.values;
    if (!rows || rows.length === 0) return 300;
    return cleanNum(rows[rows.length - 1][3]); // คอลัมน์ D: Remaining
}

async function getCryptoFearGreed() {
    try {
        const fngRes = await axios.get('https://api.alternative.me/fng/');
        return parseInt(fngRes.data.data[0].value);
    } catch (e) {
        return 50;
    }
}

async function getUsMarketFearGreed() {
    try {
        const vixHistory = await getHistoricalSafe('^VIX', {
            period1: new Date(new Date().setDate(new Date().getDate() - 365)),
            period2: new Date(),
            interval: '1d'
        });
        const closes = extractCloseSeries(vixHistory);
        if (!closes.length) return 50;
        const current = closes[closes.length - 1];
        const sorted = [...closes].sort((a, b) => a - b);
        const rank = sorted.findIndex(v => v >= current);
        const percentile = rank >= 0 ? (rank / (sorted.length - 1)) : 0.5;
        const fng = Math.round((1 - percentile) * 100);
        return Math.max(0, Math.min(100, fng));
    } catch (e) {
        return 50;
    }
}

async function getMarketInfo(symbol, options = {}) {
    const { days = 365, includeQuote = true } = options;
    try {
        let ySym = symbol.trim().toUpperCase();
        if (['BTC', 'ETH', 'SOL'].includes(ySym)) ySym += '-USD';
        const history = await getHistoricalSafe(ySym, {
            period1: new Date(new Date().setDate(new Date().getDate() - days)),
            period2: new Date(),
            interval: '1d'
        });
        const closes = extractCloseSeries(history);
        let price = closes[closes.length - 1] || 0;
        if (includeQuote) {
            const quote = await getQuoteSafe(ySym);
            price = quote?.regularMarketPrice || quote?.price || price;
        }
        return { price, closes, history };
    } catch (e) { return { price: 0, closes: [], history: [] }; }
}

function computeDecision({ price, closes, avg_cost, current_alloc, target_alloc, fng, budget = 0, history = null }) {
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

async function analyze(asset, budget, fng, marketInfo = null, currentAllocOverride = null) {
    const { symbol, avg_cost, current_alloc, target_alloc, qty } = asset;
    const { price, closes, history } = marketInfo || await getMarketInfo(symbol);

    if (price === 0 || closes.length < 200) return { symbol, status: "Insufficient Data" };

    const effectiveCurrentAlloc = currentAllocOverride != null ? currentAllocOverride : current_alloc;
    const decision = computeDecision({ price, closes, avg_cost, current_alloc: effectiveCurrentAlloc, target_alloc, fng, budget, history });
    if (decision.status === "Insufficient Data") return { symbol, status: "Insufficient Data" };

    const allocation_current_pct = Math.round(effectiveCurrentAlloc * 10000) / 100;
    const allocation_target_pct = Math.round(target_alloc * 10000) / 100;
    const allocation_gap_pct = Math.round((allocation_target_pct - allocation_current_pct) * 100) / 100;

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
        risk_reward_ratio: decision.risk_reward_ratio
    };
}

app.get('/analyze', async (req, res) => {
    try {
        const [portfolio, budget] = await Promise.all([
            getPortfolioSummary(), getRemainingBudget()
        ]);
        const [cryptoFng, usFng] = await Promise.all([
            getCryptoFearGreed(), getUsMarketFearGreed()
        ]);
        const marketInfos = await Promise.all(portfolio.map(a => getMarketInfo(a.symbol)));
        const marketValues = marketInfos.map((m, i) => (m.price || 0) * (portfolio[i].qty || 0));
        const totalMarketValue = marketValues.reduce((sum, v) => sum + v, 0);
        marketValues.forEach((val, i) => {
            const symbol = portfolio[i].symbol;
            const price = marketInfos[i].price || 0;
            const qty = portfolio[i].qty || 0;
            console.log(`💹 Valuation ${symbol}: price=${price} qty=${qty} value=${Math.round(val * 100) / 100}`);
        });
        console.log(`💹 Total Market Value: ${Math.round(totalMarketValue * 100) / 100}`);
        marketValues.forEach((val, i) => {
            const symbol = portfolio[i].symbol;
            const targetAlloc = portfolio[i].target_alloc || 0;
            const currentAllocByValue = totalMarketValue > 0 ? (val / totalMarketValue) : 0;
            const gap = ((targetAlloc - currentAllocByValue) * 100).toFixed(2);
            console.log(`📈 Allocation ${symbol}: current=${(currentAllocByValue * 100).toFixed(2)}% target=${(targetAlloc * 100).toFixed(2)}% gap=${gap}%`);
        });
        const results = await Promise.all(portfolio.map((a, i) => {
            const currentAllocByValue = totalMarketValue > 0 ? (marketValues[i] / totalMarketValue) : a.current_alloc;
            const fng = isCryptoSymbol(a.symbol) ? cryptoFng : usFng;
            return analyze(a, budget, fng, marketInfos[i], currentAllocByValue);
        }));
        res.json({
            budget_remaining: budget,
            fear_greed_crypto: cryptoFng,
            fear_greed_us: usFng,
            analysis: results
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 running at http://0.0.0.0:${PORT}`);
});
