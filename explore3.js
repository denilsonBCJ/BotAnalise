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
    await new Promise(r => setTimeout(r, 5000));
    
    // Try to extract game state from the page
    const gameData = await page.evaluate(() => {
        // Look for React state or game data in window
        const result = {
            windowKeys: Object.keys(window).filter(k => k.toLowerCase().includes('game') || k.toLowerCase().includes('crash') || k.toLowerCase().includes('socket') || k.toLowerCase().includes('ws')),
            localStorage: {},
            sessionStorage: {}
        };
        
        // Check localStorage
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.includes('game') || key.includes('crash') || key.includes('socket') || key.includes('ws'))) {
                result.localStorage[key] = localStorage.getItem(key);
            }
        }
        
        // Check sessionStorage
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && (key.includes('game') || key.includes('crash') || key.includes('socket') || key.includes('ws'))) {
                result.sessionStorage[key] = sessionStorage.getItem(key);
            }
        }
        
        return result;
    });
    
    console.log('Game data from page:', JSON.stringify(gameData, null, 2));
    
    // Try to find the game component and extract state
    const reactState = await page.evaluate(() => {
        // Find React fiber root
        const roots = [];
        for (const key of Object.keys(document)) {
            if (key.startsWith('__reactFiber') || key.startsWith('__reactContainer')) {
                roots.push({ key, value: document[key] });
            }
        }
        return roots;
    });
    
    console.log('React roots:', JSON.stringify(reactState, null, 2));
    
    // Keep browser open
    await new Promise(() => {});
})();