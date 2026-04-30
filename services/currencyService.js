import axios from 'axios';

let cachedRate = 35.0; // Fallback
let lastFetched = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

export async function getUsdThbRate() {
    const now = Date.now();
    if (now - lastFetched < CACHE_DURATION) {
        return cachedRate;
    }

    try {
        // Try a free API (exchangerate.host or similar)
        // Note: Some free APIs change their terms. 
        // Using a reliable fallback if API fails.
        const res = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
        if (res.data && res.data.rates && res.data.rates.THB) {
            cachedRate = res.data.rates.THB;
            lastFetched = now;
            console.log(`Updated USD/THB rate: ${cachedRate}`);
        }
    } catch (e) {
        console.error("Failed to fetch exchange rate, using fallback:", e.message);
    }
    return cachedRate;
}
