import { getRemainingBudget } from './services/portfolioService.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkBudget() {
    try {
        console.log("🔍 Checking Budget from Google Sheets...");
        const budget = await getRemainingBudget();
        console.log(`✅ Current Budget found: ${budget}`);
        console.log(`Type of budget: ${typeof budget}`);
        
        if (budget === 0) {
            console.log("⚠️ Budget is 0. Please check if 'Budget_Log' sheet has a value in Column D of the last row.");
        }
    } catch (error) {
        console.error("❌ Failed to fetch budget:", error.message);
    }
}

checkBudget();
