const http = require('http');

const makeRequest = (i) => {
    return new Promise((resolve) => {
        const req = http.get('http://localhost:3000/api/resource', (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                // Log concise output
                console.log(`Req ${i}: ${res.statusCode} ${res.statusCode === 429 ? '(Rate Limited)' : ''}`);
                resolve();
            });
        });
        req.on('error', (e) => {
            console.error(`Req ${i} failed: ${e.message}`);
            resolve();
        });
    });
};

const run = async () => {
    console.log('Testing Limit (Max 10 per minute)...');
    for (let i = 1; i <= 12; i++) {
        await makeRequest(i);
        // 200ms delay
        await new Promise(r => setTimeout(r, 200));
    }
};

setTimeout(run, 2000); // Wait 2s for server to possibly start
