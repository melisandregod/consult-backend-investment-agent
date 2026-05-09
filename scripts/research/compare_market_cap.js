import { yahooFinance } from '../../config/yahooFinance.js';

async function compareMarketCap() {
    const symbols = ['NVDA', 'AMD', 'ARM', 'INTC'];
    console.log("🏢 Market Cap Comparison: NVDA vs AMD vs ARM vs INTC");
    console.log("=".repeat(65));
    console.log(`Symbol | Market Cap (USD) | Ratio vs NVDA | Status`);
    console.log("-".repeat(65));

    try {
        const results = await Promise.all(symbols.map(s => yahooFinance.quote(s)));
        
        const nvda = results.find(r => r.symbol === 'NVDA');
        const nvdaCap = nvda.marketCap;

        results.sort((a, b) => b.marketCap - a.marketCap).forEach(r => {
            const capInTrillion = (r.marketCap / 1e12).toFixed(2);
            const ratio = (r.marketCap / nvdaCap).toFixed(3);
            let status = "";
            if (r.symbol === 'NVDA') status = "👑 Leader";
            else if (ratio < 0.1) status = "Small/Emerging";
            else status = "Major Competitor";

            console.log(`${r.symbol.padEnd(6)} | $${capInTrillion.padStart(6)} Trillion | ${(ratio * 100).toFixed(1).padStart(5)}%       | ${status}`);
        });

    } catch (e) {
        console.error("❌ Error fetching market cap:", e.message);
    }
    console.log("=".repeat(65));
}

compareMarketCap();
