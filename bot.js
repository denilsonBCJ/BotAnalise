const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const http = require('http');
const readline = require('readline');

class CrashBot {
    constructor() {
        this.browser = null;
        this.page = null;
        this.dataDirectory = process.env.DATA_DIR || __dirname;
        this.dataFile = path.join(this.dataDirectory, 'crash-data.jsonl');
        this.legacyDataFile = path.join(__dirname, 'crash-data.json');
        fs.mkdirSync(this.dataDirectory, { recursive: true });
        this.rounds = [];
        this.totalRounds = 0;
        this.roundsAbove2x = 0;
        this.multiplierSum = 0;
        this.maximumMultiplier = 0;
        this.isRunning = true;
        this.connected = false;
        this.currentCrash = 'Aguardando...';
        this.lastUpdatedAt = null;
    }

    recordRound(round) {
        const multiplier = Number(round.multiplier);
        if (!Number.isFinite(multiplier) || multiplier < 1) return;
        const item = {
            timestamp: round.timestamp || new Date().toISOString(),
            multiplier
        };
        this.totalRounds += 1;
        this.multiplierSum += multiplier;
        if (multiplier >= 2) this.roundsAbove2x += 1;
        this.maximumMultiplier = Math.max(this.maximumMultiplier, multiplier);
        this.rounds.unshift(item);
        if (this.rounds.length > 12) this.rounds.length = 12;
    }

    async loadHistory() {
        try {
            if (!fs.existsSync(this.dataFile) && fs.existsSync(this.legacyDataFile)) {
                const previousRounds = JSON.parse(fs.readFileSync(this.legacyDataFile, 'utf8'));
                if (Array.isArray(previousRounds)) {
                    const chronological = previousRounds.slice().reverse()
                        .filter(round => Number.isFinite(Number(round.multiplier)));
                    const compactLines = chronological.map(round => JSON.stringify([
                        round.timestamp || new Date().toISOString(),
                        Number(round.multiplier)
                    ]));
                    fs.writeFileSync(this.dataFile, compactLines.length ? `${compactLines.join('\n')}\n` : '');
                    console.log(`Histórico anterior migrado: ${compactLines.length} rodadas.`);
                }
            }

            if (!fs.existsSync(this.dataFile)) return;
            const input = readline.createInterface({
                input: fs.createReadStream(this.dataFile),
                crlfDelay: Infinity
            });
            for await (const line of input) {
                if (!line.trim()) continue;
                try {
                    const parsed = JSON.parse(line);
                    const round = Array.isArray(parsed)
                        ? { timestamp: parsed[0], multiplier: parsed[1] }
                        : parsed;
                    this.recordRound(round);
                } catch (error) {
                    console.error('Linha inválida ignorada no histórico:', error.message);
                }
            }
            console.log(`Histórico carregado: ${this.totalRounds} rodadas.`);
        } catch (error) {
            console.error('Não foi possível carregar o histórico:', error.message);
        }
    }

    storeRounds(newestFirst) {
        const chronological = newestFirst.slice().reverse()
            .filter(round => Number.isFinite(Number(round.multiplier)));
        if (!chronological.length) return;

        try {
            const compactLines = chronological.map(round => JSON.stringify([
                round.timestamp,
                Number(round.multiplier)
            ]));
            fs.appendFileSync(this.dataFile, `${compactLines.join('\n')}\n`);
        } catch (error) {
            console.error('Não foi possível gravar as rodadas:', error.message);
        }
        chronological.forEach(round => this.recordRound(round));
    }

    async init() {
        await this.loadHistory();
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

        const newestMultiplier = ticker[0];
        if (this.rounds.length === 0) {
            const initialRounds = ticker.map(multiplier => ({
                timestamp: new Date().toISOString(),
                multiplier
            }));
            this.storeRounds(initialRounds);
            console.log(`✅ ${initialRounds.length} rodadas iniciais importadas da tela.`);
            return;
        }

        const lastSavedMultiplier = this.rounds[0].multiplier;
        if (newestMultiplier === lastSavedMultiplier) return;

        const lastSavedIndex = ticker.indexOf(lastSavedMultiplier);
        const newMultipliers = lastSavedIndex !== -1
            ? ticker.slice(0, lastSavedIndex)
            : [newestMultiplier];
        const newRounds = newMultipliers.map(multiplier => ({
            timestamp: new Date().toISOString(),
            multiplier
        }));
        this.storeRounds(newRounds);
        console.log(`🎯 Nova rodada salva: ${newestMultiplier}x`);
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
                    console.log(`📊 TOTAL COLETADO: ${this.totalRounds} rodadas`);
                    const historicalRate = (this.roundsAbove2x / this.totalRounds) * 100;
                    console.log(`📈 FREQUÊNCIA HISTÓRICA ≥ 2x: ${historicalRate.toFixed(1)}% (${this.roundsAbove2x}/${this.totalRounds})`);
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
        const sampleSize = bot.totalRounds;
        const atLeast2x = bot.roundsAbove2x;
        let stats = null;
        if (sampleSize > 0) {
            const proportion = atLeast2x / sampleSize;
            const z = 1.959963984540054;
            const zSquared = z * z;
            const denominator = 1 + zSquared / sampleSize;
            const center = (proportion + zSquared / (2 * sampleSize)) / denominator;
            const margin = z * Math.sqrt(
                (proportion * (1 - proportion) / sampleSize) +
                (zSquared / (4 * sampleSize * sampleSize))
            ) / denominator;
            stats = {
                sampleSize,
                atLeast2x,
                frequencyAtLeast2x: Number((proportion * 100).toFixed(1)),
                signal80: proportion >= 0.8,
                confidence95: {
                    lower: Number((Math.max(0, center - margin) * 100).toFixed(1)),
                    upper: Number((Math.min(1, center + margin) * 100).toFixed(1))
                },
                average: Number((bot.multiplierSum / sampleSize).toFixed(2)),
                maximum: bot.maximumMultiplier
            };
        }
        res.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store'
        });
        res.end(JSON.stringify({
            running: bot.isRunning,
            connected: bot.connected,
            currentCrash: bot.currentCrash,
            lastUpdatedAt: bot.lastUpdatedAt,
            rounds: bot.rounds,
            totalRounds: bot.totalRounds,
            stats
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
            if (validPublisherId) {
                const recoveryTags = fs.readFileSync(path.join(__dirname, 'adsense-recovery.html'), 'utf8')
                    .replaceAll('pub-3033798023499077', adsenseClientId.slice(7));
                page = page.replace('<!-- ADSENSE_CODE -->',
                    `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClientId}" crossorigin="anonymous"></script>\n${recoveryTags}`);
            }
            if (validPublisherId && validAdSlot) {
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
