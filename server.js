import express from 'express';
import cors from 'cors';
import { PORT } from './config/env.js';
import analysisRoutes from './routes/analysisRoutes.js';

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use(analysisRoutes);

// Basic health check
app.get('/', (req, res) => {
    res.json({ status: 'OK', message: 'Investment Backend Refactored API' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
});
