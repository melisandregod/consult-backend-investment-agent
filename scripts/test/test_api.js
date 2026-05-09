import http from 'http';
import dotenv from 'dotenv';
dotenv.config();
const PORT = process.env.PORT || 3001;
http.get(`http://localhost:${PORT}/api/transactions`, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const txs = JSON.parse(data);
      const btcTxs = txs.filter(t => t.Asset === 'BTC');
      console.log("First 5 BTC transactions:");
      console.log(btcTxs.slice(0, 5));
      const totalQty = btcTxs.reduce((sum, t) => sum + (t.Quantity || 0), 0);
      const totalUsd = btcTxs.reduce((sum, t) => sum + (t.Total_USD || 0), 0);
      console.log('Total BTC Qty:', totalQty);
      console.log('Total BTC USD:', totalUsd);
    } catch (e) {
      console.error(e);
    }
  });
}).on('error', err => console.log(err.message));
