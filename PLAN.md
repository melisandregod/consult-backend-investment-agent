# Investment Strategy Plan: Selective Buy DCA 2.0 (Smart Distribution)

## 🎯 Objective
To achieve maximum risk-adjusted returns using an AI-driven "Smart DCA" strategy. The system prioritizes investments based on technical value (Score) and portfolio discipline (Target Allocation).

## 📈 Validated Strategy: Smart Distribution 2.0
The strategy uses a **Priority Index** to allocate funds:
`Priority = Score * Max(0, Allocation Gap USD)`

This ensures we aggressively buy assets that are both **undervalued** and **underweight** in the portfolio.

### Core Principles
1.  **DCA Frequency:** Monthly (Standard execution on the 27th).
2.  **Budget:** $300 USD per month (Dynamic adjustment based on Google Sheets).
3.  **Selective Entry (Score-based):**
    *   **Score >= 60 (STRONG_BUY/BUY):** High priority for budget allocation.
    *   **Score >= 40 (ACCUMULATE):** Eligible for allocation if budget permits.
    *   **Score < 40 (WAIT):** Hold budget as cash for future opportunities.
4.  **Portfolio Discipline:**
    *   No new money is allocated to assets exceeding their **Target Allocation**.
    *   Budget is concentrated into assets with the largest **Allocation Gaps**.

## 📊 Backtest Performance (5-Year Selective DCA)
*Data based on May 2021 - May 2026*
- **Total Invested:** $18,000.00
- **Final Value:** **$41,566.79**
- **Net Profit:** **+130.93%**
- **Annualized Rate (CAGR):** **18.22%**
- **Max Drawdown:** **-14.81%** (Significantly lower risk than pure BTC holding)
- **Efficiency:** Outperformed Blind DCA by ~5% total return with lower volatility.

## 🛠 Operation Manual
### Real-Time Analysis
To get today's specific buy instructions:
```bash
node scripts/analyze.js
```
The script will now output the exact `Recommend $...` for each asset based on the current $300 budget.

### Strategy Validation
To re-run the 5-year simulation:
```bash
npm run backtest
```

## 📋 Asset Targets
| Type | Asset | Target % | Role |
| :--- | :--- | :--- | :--- |
| Crypto | BTC | 30.0% | High-Growth Core |
| Stock | NVDA | 10.0% | Tech Momentum |
| Stock | AAPL | 10.0% | Stability/Growth |
| Stock | MSFT | 10.0% | Enterprise Core |
| Stock | ... | 10.0% | Diversification |

---
*Last Updated: May 4, 2026 (Logic Unified: API & Backtest v2.0)*
