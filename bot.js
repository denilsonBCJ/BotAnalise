const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const http = require('http');

class CrashBot {
    constructor() {
        this.browser = null;
        this.page = null;
        this.dataFile = path.join(__dirname, 'crash-data.json');
        try {
            this.rounds = fs.existsSync(this.dataFile)
                ? JSON.parse(fs.readFileSync(this.dataFile, 'utf8'))
                : [];
        } catch (e) {
            console.error('Não foi possível carregar crash-data.json:', e.message);
            this.rounds = [];
        }
        this.isRunning = true;
        this.connected = false;
        this.currentCrash = 'Aguardando...';
        this.lastUpdatedAt = null;
    }

    saveData() {
        try {
            fs.writeFileSync(this.dataFile, JSON.stringify(this.rounds.slice(0, 1000), null, 2));
        } catch (e) {}
    }

    async init() {
        console.log('🚀 Iniciando navegador...');
        this.browser = await puppeteer.launch({
            headless: true, 
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1280, height: 800 });

        console.log('🌐 Acessando o jogo Crash...');
        await this.page.goto('https://faucetpay.io/play/crash', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });
        
        console.log('⏳ Aguardando o jogo conectar...');
        await this.page.waitForFunction(
            () => document.body.innerText.includes('LIVE'),
            { timeout: 20000 }
        );
        this.connected = true;
        console.log('✅ Jogo conectado!');
        await new Promise(r => setTimeout(r, 3000));
    }

    async scrapeData() {
        try {
            return await this.page.evaluate(() => {
                let tickerValores = [];
                let crashAtual = "Aguardando...";

                // 1. PEGAR O CRASH ATUAL (O número gigante no meio da tela)
                const todosElementos = Array.from(document.querySelectorAll('div, span, h1, h2, p'));
                let maiorFonte = 0;
                
                for (const el of todosElementos) {
                    const txt = el.innerText ? el.innerText.trim() : "";
                    if (txt.endsWith('x') || txt === "CRASHED") {
                        const tamanho = parseFloat(window.getComputedStyle(el).fontSize);
                        if (tamanho > maiorFonte) {
                            maiorFonte = tamanho;
                            crashAtual = txt.replace('\n', '');
                        }
                    }
                }

                // 2. PEGAR O TICKER DO TOPO
                const containerTopo = document.querySelector('div.ml-auto.flex.min-w-0.items-center');
                
                if (containerTopo) {
                    const spans = Array.from(containerTopo.querySelectorAll('span'));
                    for (const span of spans) {
                        const txt = span.innerText || "";
                        const limpo = txt.replace(/x/gi, '').replace(/\n/g, '').replace(/ /g, '').trim();
                        const valor = parseFloat(limpo);
                        
                        if (!isNaN(valor) && valor >= 1.0 && valor <= 10000) {
                            if (tickerValores.length === 0 || tickerValores[tickerValores.length - 1] !== valor) {
                                tickerValores.push(valor);
                            }
                        }
                    }
                }

                // Retorna no máximo os 12 primeiros
                return { ticker: tickerValores.slice(0, 12), atual: crashAtual };
            });
        } catch (e) {
            return { ticker: [], atual: "Erro na leitura" };
        }
    }

    processRounds(ticker) {
        if (!ticker || ticker.length === 0) return;

        const maisRecente = ticker[0];

        if (this.rounds.length === 0) {
            // Na primeira execução, pega as 12 da tela e já salva
            const novas = ticker.map(m => ({
                id: Date.now() + Math.random(),
                timestamp: new Date().toISOString(),
                multiplier: m
            }));
            this.rounds = novas; // O index 0 já é o mais recente
            this.saveData();
            console.log("✅ 12 rodadas iniciais importadas da tela!");
        } else {
            const ultimaSalva = this.rounds[0].multiplier;

            if (maisRecente !== ultimaSalva) {
                const index = ticker.indexOf(ultimaSalva);
                let novasJogadas = [];
                
                if (index !== -1) {
                    novasJogadas = ticker.slice(0, index);
                } else {
                    novasJogadas = [maisRecente];
                }

                const rodadasFormatadas = novasJogadas.map(m => ({
                    id: Date.now() + Math.random(),
                    timestamp: new Date().toISOString(),
                    multiplier: m
                }));

                // Adiciona as novas no começo
                this.rounds = [...rodadasFormatadas, ...this.rounds];
                this.saveData();
                console.log(`🎯 Nova rodada salva: ${maisRecente}x`);
            }
        }
    }

    async run() {
        console.log('🤖 Monitorando...\n');
        
        while (this.isRunning) {
            try {
                const dados = await this.scrapeData();
                this.currentCrash = dados.atual;
                this.lastUpdatedAt = new Date().toISOString();
                
                process.stdout.write('\x1Bc'); // Limpa a tela
                console.log('═'.repeat(65));
                console.log(`🕹️  CRASH ATUAL: ${dados.atual}`);
                console.log('─'.repeat(65));
                
                if (this.rounds.length > 0) {
                    const history = this.rounds.slice(0, 12).map(r => 
                        r.multiplier >= 2 ? `🟢${r.multiplier.toFixed(2)}x` : `🔴${r.multiplier.toFixed(2)}x`
                    ).join(' ');
                    
                    console.log(`📜 HISTÓRICO (12 últimas): ${history}`);
                    console.log(`📊 TOTAL COLETADO: ${this.rounds.length} rodadas`);
                    
                    if (this.rounds.length >= 100) {
                        const recent100 = this.rounds.slice(0, 100);
                        const acimaDe2x = recent100.filter(r => r.multiplier >= 2.0).length;
                        console.log(`🎯 Probabilidade >= 2x (Próxima): ${acimaDe2x}%`);
                    } else {
                        console.log(`⏳ Faltam ${100 - this.rounds.length} rodadas para probabilidade...`);
                    }
                } else {
                    console.log(`⏳ Aguardando as primeiras rodadas...`);
                }
                
                console.log('═'.repeat(65));
                
                if (dados.ticker.length > 0) {
                    this.processRounds(dados.ticker);
                }
                
            } catch (e) {
                console.log("Erro:", e.message);
            }
            
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    stop() {
        this.isRunning = false;
        if (this.browser) this.browser.close();
        process.exit(0);
    }
}

const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const adsenseClientId = process.env.ADSENSE_CLIENT_ID || '';
    const adsenseSlotId = process.env.ADSENSE_SLOT_ID || '';
    const validPublisherId = /^ca-pub-\d{16}$/.test(adsenseClientId);
    const validAdSlot = /^\d{1,20}$/.test(adsenseSlotId);

    if (pathname === '/ads.txt') {
        if (!validPublisherId) {
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('AdSense ainda não configurado.');
            return;
        }
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`google.com, ${adsenseClientId.slice(3)}, DIRECT, f08c47fec0942fa0\n`);
        return;
    }
    if (pathname === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', running: bot.isRunning }));
        return;
    }
    if (pathname === '/api/status') {
        const recent100 = bot.rounds.slice(0, 100);
        const atLeast2x = recent100.filter(round => Number(round.multiplier) >= 2).length;
        res.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store'
        });
        res.end(JSON.stringify({
            running: bot.isRunning,
            connected: bot.connected,
            currentCrash: bot.currentCrash,
            lastUpdatedAt: bot.lastUpdatedAt,
            rounds: bot.rounds.slice(0, 12),
            totalRounds: bot.rounds.length,
            stats: recent100.length ? {
                sampleSize: recent100.length,
                atLeast2x,
                frequencyAtLeast2x: Math.round((atLeast2x / recent100.length) * 100),
                average: Number((recent100.reduce((sum, round) => sum + Number(round.multiplier || 0), 0) / recent100.length).toFixed(2)),
                maximum: Math.max(...recent100.map(round => Number(round.multiplier) || 0))
            } : null
        }));
        return;
    }
    if (pathname === '/') {
        try {
            let page = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
            if (validPublisherId) {
                page = page.replace('<!-- ADSENSE_ACCOUNT_META -->',
                    `<meta name="google-adsense-account" content="${adsenseClientId}">`);
            }
            if (validPublisherId && validAdSlot) {
                page = page.replace('<!-- ADSENSE_CODE -->',
                    `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClientId}" crossorigin="anonymous"></script>`);
                const adMarkup = `<div class="ad-wrap"><span class="ad-label">Publicidade</span><ins class="adsbygoogle" data-ad-client="${adsenseClientId}" data-ad-slot="${adsenseSlotId}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script></div>`;
                page = page.replace('<!-- ADSENSE_SLOT_LEFT -->', adMarkup)
                    .replace('<!-- ADSENSE_SLOT_RIGHT -->', adMarkup);
            }
            page = page.replace('<!-- ADSENSE_ACCOUNT_META -->', '')
                .replace('<!-- ADSENSE_CODE -->', '')
                .replace('<!-- ADSENSE_SLOT_LEFT -->', '')
                .replace('<!-- ADSENSE_SLOT_RIGHT -->', '');
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(page);
        } catch (e) {
            res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('Não foi possível carregar o painel.');
        }
        return;
    }
    res.writeHead(404);
    res.end('Not found');
});

const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`Health endpoint listening on ${port}`));

const bot = new CrashBot();
bot.init().then(() => bot.run()).catch(e => {
    console.error('❌ Erro:', e);
    process.exit(1);
});
