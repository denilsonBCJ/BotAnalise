const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    page.on('console', msg => {
        if (msg.type() === 'log' || msg.type() === 'error' || msg.type() === 'warn') {
            console.log('BROWSER CONSOLE:', msg.type(), msg.text());
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
    
    // Wait for page to fully load
    await new Promise(r => setTimeout(r, 10000));
    
    // Get the full page HTML to see what's rendered
    const html = await page.content();
    
    // Save HTML to file for inspection
    const fs = require('fs');
    fs.writeFileSync('/tmp/crash-page.html', html);
    console.log('Page HTML saved to /tmp/crash-page.html');
    
    // Try to find game elements
    const gameElements = await page.evaluate(() => {
        const elements = document.querySelectorAll('[class*="crash"], [class*="game"], [class*="round"], [class*="history"], [class*="multiplier"], [class*="bet"]');
        const result = [];
        elements.forEach(el => {
            result.push({
                tag: el.tagName,
                class: el.className,
                id: el.id,
                text: el.textContent?.substring(0, 200)
            });
        });
        return result;
    });
    
    console.log('Game-related elements:', JSON.stringify(gameElements, null, 2));
    
    // Try to find any data in the page
    const pageData = await page.evaluate(() => {
        // Look for any global variables with game data
        const data = {};
        for (const key of Object.keys(window)) {
            if (key.toLowerCase().includes('crash') || key.toLowerCase().includes('game') || key.toLowerCase().includes('round') || key.toLowerCase().includes('history') || key.toLowerCase().includes('multiplier')) {
                try {
                    data[key] = JSON.stringify(window[key]).substring(0, 500);
                } catch (e) {
                    data[key] = String(window[key]).substring(0, 500);
                }
            }
        }
        return data;
    });
    
    console.log('Window game data:', JSON.stringify(pageData, null, 2));
    
    // Try to extract data from __NEXT_DATA__ or similar
    const nextData = await page.evaluate(() => {
        const script = document.getElementById('__NEXT_DATA__');
        return script ? script.textContent : null;
    });
    
    if (nextData) {
        console.log('__NEXT_DATA__ found, length:', nextData.length);
        fs.writeFileSync('/tmp/next-data.json', nextData);
    } else {
        console.log('No __NEXT_DATA__ found');
    }
    
    // Keep browser open
    await new Promise(() => {});
})();