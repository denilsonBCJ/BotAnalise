const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class CrashBot {
    constructor() {
        this.browser = null;
        this.page = null;
        this.dataFile = path.join(__dirname, 'crash-data.json');
        this.rounds = []; // Sempre começa vazio
        this.isRunning = true;
    }

    saveData() {
        try {
            fs.writeFileSync(this.dataFile, JSON.stringify(this.rounds.slice(0, 1000), null, 2));
        } catch (e) {}
    }

    async init() {
        // 🛑 LIMPA O ARQUIVO ANTIGO PARA COMEÇAR DO ZERO
        if (fs.existsSync(this.dataFile)) {
            fs.unlinkSync(this.dataFile);
            console.log('🧹 Histórico antigo apagado. Começando do zero!');
        }

        console.log('🚀 Iniciando navegador...');
        this.browser = await puppeteer.launch({
            headless: true, 
            executablePath: '/usr/bin/chromium',
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

const bot = new CrashBot();
bot.init().then(() => bot.run()).catch(e => {
    console.error('❌ Erro:', e);
    process.exit(1);
});
