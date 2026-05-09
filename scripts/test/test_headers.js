import { getSheetsClient } from '../../config/googleSheets.js';
import { SPREADSHEET_ID } from '../../config/env.js';

async function run() {
    const gs = await getSheetsClient();
    const res = await gs.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Transactions!A1:Z' });
    const rows = res.data.values;
    console.log("Headers:", rows[0]);
    console.log("First BTC Row:", rows.find(r => r.includes('BTC')));
    
    const headers = rows[0].map(h => String(h || '').toLowerCase());
    const dateIdx = headers.findIndex(h => h.includes('date'));
    const assetIdx = headers.findIndex(h => h.includes('asset') || h.includes('symbol') || h.includes('ticker'));
    const qtyIdx = headers.findIndex(h => h.includes('qty') || h.includes('quantity'));
    const totalUsdIdx = headers.findIndex(h => h.includes('total_usd') || h.includes('amount') || h.includes('total spent'));
    console.log('Indices:', {dateIdx, assetIdx, qtyIdx, totalUsdIdx});
}
run();