import { computeDecision } from './services/analysisService.js';

// Mock data helper
const createMockData = (price, avg_cost, current_alloc, target_alloc, rsi, ema200, fng = 50) => {
    // Generate simple closes to satisfy RSI/EMA calculations
    const closes = new Array(200).fill(ema200);
    closes[closes.length - 1] = price;
    // For RSI calculation to be roughly accurate
    if (rsi > 70) closes[closes.length - 2] = price * 0.9; 
    if (rsi < 30) closes[closes.length - 2] = price * 1.1;

    return {
        price,
        closes,
        avg_cost,
        current_alloc,
        target_alloc,
        fng,
        budget: 100
    };
};

console.log("=== Testing Analysis Logic ===\n");

// Scenario 1: TSM +300% and Over-allocated (Expected: TRIM)
console.log("Scenario 1: TSM style (+300%, Over-allocated, High RSI)");
const tsmData = createMockData(400, 100, 0.25, 0.10, 75, 250); // Price 400, Cost 100, Alloc 25% vs Target 10%
const tsmResult = computeDecision(tsmData);
console.log(`Action: ${tsmResult.action}`);
console.log(`Score: ${tsmResult.score}`);
console.log(`Reasons: ${tsmResult.reasons.join(', ')}`);
console.log("----------------------------\n");

// Scenario 2: Deep Value / Buy the Dip (Expected: STRONG_BUY or BUY)
console.log("Scenario 2: Deep Value (Below EMA200, Oversold RSI, Under-allocated)");
const valueData = createMockData(80, 100, 0.02, 0.10, 25, 100, 20); // Price 80, EMA 100, RSI 25, FnG 20
const valueResult = computeDecision(valueData);
console.log(`Action: ${valueResult.action}`);
console.log(`Score: ${valueResult.score}`);
console.log(`Reasons: ${valueResult.reasons.join(', ')}`);
console.log("----------------------------\n");

// Scenario 3: Strong Momentum Winner (Expected: BUY or ACCUMULATE)
console.log("Scenario 3: Strong Momentum (Near ATH, Above EMA200, but within Target)");
const momData = createMockData(150, 120, 0.05, 0.10, 55, 130); // Price 150, EMA 130, Near ATH
const momResult = computeDecision(momData);
console.log(`Action: ${momResult.action}`);
console.log(`Score: ${momResult.score}`);
console.log(`Reasons: ${momResult.reasons.join(', ')}`);
console.log("----------------------------\n");
