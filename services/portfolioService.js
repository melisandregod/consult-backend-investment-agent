import { getSheetsClient } from '../config/googleSheets.js';
import { SPREADSHEET_ID, TARGET_CRYPTO_SYMBOLS, TARGET_CRYPTO_PCT, TARGET_STOCK_COUNT, TARGET_STOCK_TOTAL_PCT } from '../config/env.js';
import { cleanNum } from '../utils/math.js';

export async function getPortfolioSummary() {
    const gs = await getSheetsClient();
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
        const isKnownCrypto = TARGET_CRYPTO_SYMBOLS.includes(row.symbolKey) || row.symbolKey.endsWith('-USD');
        return isStockType || row.type === 'CRYPTO' || isKnownCrypto;
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

        return { symbol, avg_cost, current_alloc, target_alloc, qty, type, spentValue };
    }).filter(i => i.symbol);
}

export async function getRemainingBudget() {
    const gs = await getSheetsClient();
    const res = await gs.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Budget_Log!A2:D' });
    const rows = res.data.values;
    if (!rows || rows.length === 0) return 300;
    return cleanNum(rows[rows.length - 1][3]);
}
