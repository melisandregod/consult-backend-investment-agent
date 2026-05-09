import { spawn } from 'child_process';
import http from 'http';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3001;
const API_URL = `http://localhost:${PORT}/`;

/**
 * Check if the server is responding to health checks
 */
async function isServerReady() {
    return new Promise((resolve) => {
        const req = http.get(API_URL, (res) => {
            // Consider 200 OK as ready
            resolve(res.statusCode === 200);
        }).on('error', () => {
            resolve(false);
        });
        req.end();
    });
}

/**
 * Poll the server until it's ready or timeout
 */
async function waitServer() {
    console.log("⏳ Waiting for backend to be ready...");
    for (let i = 0; i < 20; i++) {
        if (await isServerReady()) {
            console.log("✅ Backend is ready!");
            return true;
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    return false;
}

async function run() {
    const args = process.argv.slice(2);
    
    console.log("🚀 Starting backend server...");
    // Start the server process
    const server = spawn('node', ['server.js'], { 
        stdio: 'inherit',
        env: { ...process.env, PORT } 
    });

    try {
        const ready = await waitServer();
        if (!ready) {
            console.error("❌ Error: Server failed to start in time.");
            server.kill();
            process.exit(1);
        }

        console.log("\n📈 Executing Report Tool...");
        // Run the python script and pass through any arguments (month, year)
        const pythonProcess = spawn('python3', ['ExportReport/aistock_tool.py', ...args], { 
            stdio: 'inherit' 
        });

        // Wait for the python script to finish
        const exitCode = await new Promise((resolve) => {
            pythonProcess.on('close', (code) => resolve(code));
        });

        if (exitCode !== 0) {
            console.error(`❌ Report tool exited with code ${exitCode}`);
        }

    } catch (err) {
        console.error("❌ Unexpected error:", err);
    } finally {
        console.log("\n🛑 Shutting down backend server...");
        server.kill();
        process.exit(0);
    }
}

run();
