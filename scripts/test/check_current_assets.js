import { getPortfolioSummary } from '../../services/portfolioService.js';
import dotenv from 'dotenv';
dotenv.config();

async function checkAssets() {
    const portfolio = await getPortfolioSummary();
    console.log("Current Portfolio Assets:");
    portfolio.forEach(a => {
        console.log(`- ${a.symbol} (${a.type}): Target ${a.target_alloc * 100}%`);
    });
}
checkAssets();
