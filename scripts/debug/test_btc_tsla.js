import { getPortfolioSummary, getRemainingBudget } from './services/portfolioService.js';
import { getCryptoFearGreed, getUsMarketFearGreed, getMarketInfo, isCryptoSymbol } from './services/marketDataService.js';
import { analyze } from './services/analysisService.js';
import dotenv from 'dotenv';

dotenv.config();

async function debugBtcTsla() {
    const symbols = ['BTC', 'TSLA'];
    const budget = await getRemainingBudget();
    const cryptoFng = await getCryptoFearGreed();
    const usFng = await getUsMarketFearGreed();

    console.log(`--- DEBUG BTC & TSLA ---`);
    console.log(`Budget: ${budget}, Crypto FnG: ${cryptoFng}, US FnG: ${usFng}\n`);

    const portfolio = await getPortfolioSummary();

    for (const sym of symbols) {
        const asset = portfolio.find(a => a.symbol === sym) || { symbol: sym, avg_cost: 0, current_alloc: 0, target_alloc: 0.1, qty: 0 };
        const marketInfo = await getMarketInfo(asset.symbol);
        const fng = isCryptoSymbol(asset.symbol) ? cryptoFng : usFng;
        
        const result = await analyze(asset, budget, fng, marketInfo);
        
        console.log(`[${sym}]`);
        console.log(`Score: ${result.score}`);
        console.log(`Action: ${result.action}`);
        console.log(`Current Alloc: ${result.allocation_current_pct}%`);
        console.log(`Target Alloc: ${result.allocation_target_pct}%`);
        console.log(`Price: ${result.price} | EMA200: ${result.ema200}`);
        console.log(`RSI: ${result.rsi}`);
        console.log(`Reasons: ${result.reasons.join(' | ')}`);
        console.log('------------------------\n');
    }
}

debugBtcTsla();
