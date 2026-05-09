# consult-backend-investment-n8n-agent-ai

Backend service for portfolio analysis and backtesting. It reads portfolio data from Google Sheets, pulls market data from Yahoo Finance, and exposes JSON APIs for analysis results.

## Features
- Portfolio analysis and action recommendations
- Backtesting with decision rules
- Google Sheets + Service Account integration

## Requirements
- Node.js 18+
- Google Service Account JSON file
- Google Sheet with required tabs/columns

## Setup
1) Install dependencies

```bash
npm i
```

2) Create .env and set variables

```
PORT=3001
SPREADSHEET_ID=YOUR_SHEET_ID
GOOGLE_SERVICE_ACCOUNT=service_account.json
```

3) Place the Service Account JSON at the path in `GOOGLE_SERVICE_ACCOUNT`

4) Grant the Service Account read access to the Sheet

## Run
### Backend Server
Default (hot reload)
```bash
npm start
```
Or
```bash
npm run dev
```
Server starts at http://localhost:3001

### Command Line Tools
We provide several scripts for quick analysis and strategy validation:

- **Real-time Analysis:** Get investment recommendations for your current portfolio.
  ```bash
  npm run analyze
  ```
- **Backtest Strategy:** Run the validated "Selective Buy" strategy.
  ```bash
  # Default (5 years, $300/month)
  npm run backtest
  
  # Custom (e.g., 3 years, $500/month)
  npm run backtest -- 3 500
  ```
- **Blind DCA Backtest:** Compare with a standard monthly DCA approach.
  ```bash
  # Default (5 years, $300/month)
  npm run backtest:blind
  
  # Custom (e.g., 2 years, $200/month)
  npm run backtest:blind -- 2 200
  ```

## Project Structure
- `scripts/`: Standalone tools for analysis and backtesting.
- `services/`: Core logic for analysis, portfolio management, and market data.
- `routes/`: Express API endpoints.
- `config/`: Configuration for Google Sheets, Yahoo Finance, and Env variables.
- `utils/`: Shared math and data normalization helpers.
- `PLAN.md`: Detailed investment strategy and backtest results.

## API
### GET /analyze
Returns portfolio analysis and suggested actions.

Example fields
- `budget_remaining`
- `fear_greed`
- `analysis[]`

### GET /api/summary
Returns a high-level summary of the portfolio value and budget.

## Detailed Calculation
This section explains the indicators and scoring logic used by the analyzer.

### 1) Allocation
- Current allocation is computed from spent value
- Target allocation is derived from environment defaults

### 2) Allocation Gap
- `alloc_gap_pct = (target_alloc - current_alloc) * 100`

### 3) RSI (14)
- RSI < 30: Oversold
- RSI < 50: Weak momentum

### 4) EMA200
- %diff = (price - ema200) / ema200 * 100

### 5) Volume Shock (20 days)
- `volumeShockPct = (lastVol - avg20) / avg20 * 100`


---
*For more details on the validated investment strategy, see [PLAN.md](./PLAN.md).*
