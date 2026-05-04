import YahooFinance from 'yahoo-finance2';
import axios from 'axios';

const yahooFinance = new YahooFinance({
    suppressNotices: ["ripHistorical", "yahooSurvey"],
    validation: {
        logErrors: false,
    },
});

const isYahooValidationError = (error) => {
    const message = String(error?.message || '');
    return error?.name === 'FailedYahooValidationError' || message.includes('Failed Yahoo Schema validation') || message.includes('Failed validation:');
};

async function quoteSafe(symbol) {
    try {
        return await yahooFinance.quote(symbol);
    } catch (error) {
        if (!isYahooValidationError(error)) throw error;
        return await yahooFinance.quote(symbol, undefined, { validateResult: false });
    }
}

async function historicalSafe(symbol, queryOptions) {
    try {
        return await yahooFinance.historical(symbol, queryOptions);
    } catch (error) {
        if (!isYahooValidationError(error)) throw error;
        return await yahooFinance.historical(symbol, queryOptions, { validateResult: false });
    }
}

async function test() {
    console.log("🔍 Starting API Test...");

    // 1. ทดสอบ Fear & Greed (Sentiment)
    try {
        const fng = await axios.get('https://api.alternative.me/fng/');
        console.log("✅ Fear & Greed API: Connected!");
        console.log("   Value:", fng.data.data[0].value);
    } catch (e) {
        console.log("❌ Fear & Greed API: Failed!", e.message);
    }

    // 2. ทดสอบ Yahoo Finance (Price & History)
    try {
        const symbol = 'BTC-USD';
        console.log(`\n🔍 Testing Yahoo Finance with ${symbol}...`);
        const quote = await quoteSafe(symbol);
        console.log("✅ Yahoo Quote: Connected!");
        console.log("   Current Price:", quote.regularMarketPrice);

        const history = await historicalSafe(symbol, {
            period1: new Date('2025-01-01'),
            period2: new Date(),
            interval: '1d'
        });
        const usableCloseCount = history.filter(h => h?.close != null || h?.adjclose != null || h?.open != null).length;
        console.log("✅ Yahoo Historical: Connected!");
        console.log("   Data Points:", history.length);
        console.log("   Usable Candles:", usableCloseCount);
    } catch (e) {
        console.log("❌ Yahoo Finance: Failed!");
        console.log("   Reason:", e.message);
    }
}

test();