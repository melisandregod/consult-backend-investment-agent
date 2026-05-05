import axios from 'axios';
import { yahooFinance } from '../config/yahooFinance.js';
import { normalizeHistoryRows, extractCloseSeries } from '../utils/math.js';

const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'SOL'];

export const isCryptoSymbol = (symbol = '') => {
    const s = symbol.trim().toUpperCase();
    return CRYPTO_SYMBOLS.includes(s) || s.endsWith('-USD');
};

async function getChartHistorySafe(symbol, queryOptions) {
    const chartResult = await yahooFinance.chart(
        symbol,
        { ...queryOptions, return: 'array' },
        { validateResult: false }
    );
    return normalizeHistoryRows(chartResult?.quotes || []);
}

export async function getHistoricalSafe(symbol, queryOptions) {
    try {
        const chartRows = await getChartHistorySafe(symbol, queryOptions);
        if (chartRows.length > 0) return chartRows;
    } catch (error) {
        // Continue to historical fallback
    }

    try {
        return normalizeHistoryRows(await yahooFinance.historical(symbol, queryOptions));
    } catch (error) {
        const raw = await yahooFinance.historical(symbol, queryOptions, { validateResult: false });
        return normalizeHistoryRows(raw);
    }
}

export async function getQuoteSafe(symbol) {
    try {
        return await yahooFinance.quote(symbol);
    } catch (error) {
        return await yahooFinance.quote(symbol, undefined, { validateResult: false });
    }
}

export async function getCryptoFearGreed() {
    try {
        const fngRes = await axios.get('https://api.alternative.me/fng/');
        return parseInt(fngRes.data.data[0].value);
    } catch (e) {
        return 50;
    }
}

export async function getUsMarketFearGreed() {
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

export async function getMarketInfo(symbol, options = {}) {
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
