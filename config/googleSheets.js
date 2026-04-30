import { google } from 'googleapis';
import { SERVICE_ACCOUNT_FILE } from './env.js';

export const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_FILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

export const getSheetsClient = async () => {
    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth: client });
};
