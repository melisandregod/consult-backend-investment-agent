# Investment Strategy Plan: Fixed Target DCA (Balance Distribution)

## 🎯 Objective
To achieve consistent growth through a disciplined "Fixed Target" allocation strategy. The system prioritizes investments based on the Allocation Gap to maintain the desired portfolio balance.

## 📈 Strategy: Fixed Allocation DCA
The strategy uses an **Allocation Gap** to allocate funds:
`Priority = Target Allocation % - Current Allocation %`

This ensures we buy assets that are currently **underweight** in the portfolio relative to their target.

### Core Principles
1.  **DCA Frequency:** Monthly (Standard execution on the 27th).
2.  **Budget:** $300 USD per month (Dynamic adjustment based on Google Sheets).
3.  **Automatic Allocation:**
    *   Budget is concentrated into assets with the largest **Allocation Gaps**.
    *   No new money is allocated to assets exceeding their **Target Allocation**.

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
| Stock | AMZN | 10.0% | E-commerce/Cloud |
| Stock | GOOGL| 10.0% | Ad/Cloud/AI |
| Stock | TSLA | 10.0% | EV/Energy |
| Stock | TSM  | 10.0% | Semiconductor Foundry |
| **Total** | **7 Stocks** | **70.0%** | **Equity Basket** |

---
*Last Updated: May 4, 2026 (Logic Unified: API & Backtest v2.0)*
