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

export async function getTransactions() {
    const gs = await getSheetsClient();
    const res = await gs.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Transactions!A1:Z' });
    const rows = res.data.values;
    if (!rows || rows.length <= 1) return [];

    const headers = rows[0].map(h => String(h || '').toLowerCase());
    const dataRows = rows.slice(1);

    const dateIdx = headers.findIndex(h => h.includes('date'));
    const assetIdx = headers.findIndex(h => h.includes('asset') || h.includes('symbol') || h.includes('ticker'));
    const qtyIdx = headers.findIndex(h => h.includes('qty') || h.includes('quantity'));
    const totalUsdIdx = headers.findIndex(h => h.includes('total_usd') || h.includes('amount') || h.includes('total spent'));
    const typeIdx = headers.findIndex(h => h.includes('type') || h.includes('action') || h.includes('side'));

    return dataRows.map(r => {
        let isSell = false;
        if (typeIdx !== -1 && r[typeIdx]) {
            const actionType = String(r[typeIdx]).trim().toUpperCase();
            if (actionType === 'SELL') {
                isSell = true;
            }
        }
        
        let qty = cleanNum(r[qtyIdx]);
        let totalUsd = cleanNum(r[totalUsdIdx]);
        
        // Ensure values are negative if it's a SELL transaction
        if (isSell) {
            qty = -Math.abs(qty);
            totalUsd = -Math.abs(totalUsd);
        }

        return {
            Date: r[dateIdx],
            Asset: r[assetIdx],
            Quantity: qty,
            Total_USD: totalUsd
        };
    }).filter(t => t.Asset && t.Quantity !== 0);
}

export async function getRemainingBudget() {
    const gs = await getSheetsClient();
    const res = await gs.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Budget_Log!A2:D' });
    const rows = res.data.values;
    if (!rows || rows.length === 0) return 300;

    // Filter out rows where Column D (index 3) is empty or not a number
    const validRows = rows.filter(r => r[3] !== undefined && r[3] !== '' && !isNaN(cleanNum(r[3])));
    
    if (validRows.length === 0) return 300;
    
    // Get the last valid numeric entry
    return cleanNum(validRows[validRows.length - 1][3]);
}

export async function getMonthlySpending() {
    try {
        const transactions = await getTransactions();
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const spending = {};

        transactions.forEach(t => {
            if (!t.Date || !t.Asset) return;
            
            // Handle different date formats (DD/MM/YYYY or MM/DD/YYYY)
            // For simplicity, we try to parse it. 
            // If the sheet uses a consistent format that JS can't parse directly, 
            // we might need more robust parsing.
            const tDate = new Date(t.Date);
            
            // Check if date is valid and in current month
            if (!isNaN(tDate.getTime()) && 
                tDate.getMonth() === currentMonth && 
                tDate.getFullYear() === currentYear) {
                
                const symbol = t.Asset.toUpperCase();
                spending[symbol] = (spending[symbol] || 0) + (t.Total_USD || 0);
            }
        });

        return spending;
    } catch (error) {
        console.error("⚠️ Error fetching monthly spending:", error.message);
        return {};
    }
}

