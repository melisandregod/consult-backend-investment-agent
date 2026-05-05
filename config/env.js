import dotenv from 'dotenv';
dotenv.config();

export const PORT = parseInt(process.env.PORT || '3001', 10);
export const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
export const SERVICE_ACCOUNT_FILE = process.env.GOOGLE_SERVICE_ACCOUNT || 'service_account.json';
export const TARGET_CRYPTO_SYMBOLS = (process.env.TARGET_CRYPTO_SYMBOLS || 'BTC').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
export const TARGET_CRYPTO_PCT = parseFloat(process.env.TARGET_CRYPTO_PCT || '30');
export const TARGET_STOCK_TOTAL_PCT = parseFloat(process.env.TARGET_STOCK_TOTAL_PCT || '70');
export const TARGET_STOCK_COUNT = parseInt(process.env.TARGET_STOCK_COUNT || '7', 10);

if (!SPREADSHEET_ID) {
    throw new Error('Missing SPREADSHEET_ID in environment variables.');
}
