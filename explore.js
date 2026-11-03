const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Enable request/response interception
    await page.setRequestInterception(true);
    
    page.on('request', request => {
        const url = request.url();
        if (url.includes('crash') || url.includes('game') || url.includes('websocket') || url.includes('ws:') || url.includes('api') || url.includes('socket')) {
            console.log('REQUEST:', request.method(), url);
        }
        request.continue();
    });
    
    page.on('response', async response => {
        const url = response.url();
        if (url.includes('crash') || url.includes('game') || url.includes('websocket') || url.includes('ws:') || url.includes('api') || url.includes('socket')) {
            console.log('RESPONSE:', response.status(), url);
            try {
                const text = await response.text();
                console.log('BODY:', text.substring(0, 500));
            } catch (e) {
                // ignore
            }
        }
    });
    
    page.on('websocket', websocket => {
        console.log('WEBSOCKET OPENED:', websocket.url());
        websocket.on('framereceived', frame => {
            console.log('WS RECV:', frame.payload);
        });
        websocket.on('framesent', frame => {
            console.log('WS SENT:', frame.payload);
        });
    });
    
    console.log('Navigating to faucetpay.io/play/crash...');
    await page.goto('https://faucetpay.io/play/crash', { waitUntil: 'networkidle2', timeout: 60000 });
    
    console.log('Page loaded. Waiting for game data...');
    
    // Keep the browser open for manual inspection
    await new Promise(() => {});
})();