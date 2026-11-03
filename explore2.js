const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Log ALL requests and responses
    page.on('request', request => {
        console.log('>>> REQUEST:', request.method(), request.url());
    });
    
    page.on('response', async response => {
        const url = response.url();
        console.log('<<< RESPONSE:', response.status(), url);
        try {
            const text = await response.text();
            if (text.length > 0 && text.length < 2000) {
                console.log('    BODY:', text);
            } else if (text.length > 0) {
                console.log('    BODY (truncated):', text.substring(0, 500));
            }
        } catch (e) {
            // ignore
        }
    });
    
    page.on('websocket', websocket => {
        console.log('=== WEBSOCKET OPENED:', websocket.url());
        websocket.on('framereceived', frame => {
            console.log('WS <<<', frame.payload);
        });
        websocket.on('framesent', frame => {
            console.log('WS >>>', frame.payload);
        });
        websocket.on('close', () => {
            console.log('=== WEBSOCKET CLOSED');
        });
    });
    
    console.log('Navigating to faucetpay.io/play/crash...');
    await page.goto('https://faucetpay.io/play/crash', { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait a bit more for WebSocket to connect
    await new Promise(r => setTimeout(r, 10000));
    
    console.log('Done waiting. Keeping browser open...');
    await new Promise(() => {});
})();