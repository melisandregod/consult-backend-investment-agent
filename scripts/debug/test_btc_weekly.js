import { getMarketInfo } from '../../services/marketDataService.js';
import { computeDecision } from '../../services/analysisService.js';
import dotenv from 'dotenv';

dotenv.config();

async function debugBtcWeekly() {
    console.log("🔍 Debugging BTC Weekly Signals...\n");

    try {
        const marketInfo = await getMarketInfo('BTC');
        const { price, closes, history } = marketInfo;

        if (!price || !closes.length) {
            console.log("❌ Failed to fetch BTC data.");
            return;
        }

        const decision = computeDecision({
            price,
            closes,
            avg_cost: 0,
            current_alloc: 0.3,
            target_alloc: 0.3,
            fng: 50,
            budget: 300,
            history
        });

        console.log(`Current Price: $${price.toLocaleString()}`);
        console.log(`Daily EMA 200: $${decision.ema200.toLocaleString()}`);
        console.log(`Weekly EMA 30: $${decision.w_ema.toLocaleString()}`);
        console.log(`Daily RSI:     ${decision.rsi}`);
        console.log(`Weekly RSI:    ${decision.w_rsi}`);
        console.log(`Decision Score: ${decision.score}`);
        console.log(`Weekly Trend Status: ${price < decision.w_ema ? 'DOWN (Below W-EMA)' : 'UP (Above W-EMA)'}`);
        console.log("\nReasons Provided:");
        decision.reasons.forEach(r => console.log(`- ${r}`));

        console.log("\n--- Weekly Bars (Last 5) ---");
        // Helper to debug weekly aggregation
        const weeklyCloses = [];
        let currentWeekCloses = [];
        history.forEach(day => {
            currentWeekCloses.push(day.close);
            const d = new Date(day.date);
            if (d.getDay() === 0) {
                weeklyCloses.push({ date: day.date, close: currentWeekCloses[currentWeekCloses.length - 1] });
                currentWeekCloses = [];
            }
        });
        weeklyCloses.slice(-5).forEach(w => console.log(`Week ending ${w.date}: $${w.close.toLocaleString()}`));

    } catch (err) {
        console.error("❌ Error during debug:", err);
    }
}

debugBtcWeekly();
