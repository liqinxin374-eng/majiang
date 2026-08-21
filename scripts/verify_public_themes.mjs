import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const EVIDENCE_DIR = 'test-evidence';

function createStaticServer(port = 8769) {
    const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.mjs': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml'
    };

    const server = http.createServer((req, res) => {
        let reqPath = decodeURIComponent(req.url.split('?')[0]);
        if (reqPath === '/') reqPath = '/index.html';
        
        let filePath = reqPath.startsWith('/themes/') 
            ? path.join(process.cwd(), 'public', reqPath)
            : path.join(process.cwd(), reqPath);

        if (!fs.existsSync(filePath)) {
            const pubPath = path.join(process.cwd(), 'public', reqPath);
            if (fs.existsSync(pubPath)) filePath = pubPath;
            else {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
        }

        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
    });

    return new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => resolve(server));
    });
}

async function runThemeVerification() {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    const localServer = await createStaticServer(8769);
    console.log('Local static server started on http://127.0.0.1:8769');

    const tmpDir = `C:\\Users\\25852\\AppData\\Local\\Temp\\edge_theme_verify_${Date.now()}`;
    const edgeProc = spawn(EDGE_PATH, [
        '--headless=new',
        '--remote-debugging-port=9227',
        '--remote-allow-origins=*',
        '--no-proxy-server',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${tmpDir}`,
        '--window-size=1280,720',
        'http://127.0.0.1:8769/index.html'
    ]);

    try {
        let pageTarget = null;
        for (let i = 0; i < 30; i++) {
            try {
                const res = await fetch('http://127.0.0.1:9227/json/list');
                if (res.ok) {
                    const list = await res.json();
                    pageTarget = list.find(t => t.type === 'page' && t.url.includes('127.0.0.1:8769'));
                    if (pageTarget) break;
                }
            } catch {}
            await new Promise(r => setTimeout(r, 300));
        }

        if (!pageTarget) throw new Error('Could not find edge page target');

        const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

        let msgId = 1;
        function send(method, params = {}) {
            return new Promise((resolve, reject) => {
                const id = msgId++;
                const handler = (evt) => {
                    const data = JSON.parse(evt.data);
                    if (data.id === id) {
                        ws.removeEventListener('message', handler);
                        if (data.error) reject(new Error(data.error.message));
                        else resolve(data.result);
                    }
                };
                ws.addEventListener('message', handler);
                ws.send(JSON.stringify({ id, method, params }));
            });
        }

        await send('Page.enable');
        await send('Runtime.enable');
        await new Promise(r => setTimeout(r, 1500));

        // 1. Sci-Fi Home Screenshot
        const ssScifiHome = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(`${EVIDENCE_DIR}/public-scifi-home-evidence-2026-08-19.png`, Buffer.from(ssScifiHome.data, 'base64'));

        // 2. Switch to Classic Guofeng on Home
        await send('Runtime.evaluate', {
            expression: `
                document.body.className = 'cyber-terminal theme-classic theme-background-classic theme-tile-classic theme-table-classic home-active';
            `
        });
        await new Promise(r => setTimeout(r, 500));
        const ssClassicHome = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(`${EVIDENCE_DIR}/public-classic-home-evidence-2026-08-19.png`, Buffer.from(ssClassicHome.data, 'base64'));

        // 3. Switch to Xianxia on Home
        await send('Runtime.evaluate', {
            expression: `
                document.body.className = 'cyber-terminal theme-xianxia theme-background-xianxia theme-tile-xianxia theme-table-xianxia home-active';
            `
        });
        await new Promise(r => setTimeout(r, 500));
        const ssXianxiaHome = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(`${EVIDENCE_DIR}/public-xianxia-home-evidence-2026-08-19.png`, Buffer.from(ssXianxiaHome.data, 'base64'));

        // 4. Enter Room & Verify Table Embedding
        await send('Runtime.evaluate', {
            expression: `
                document.getElementById('home-screen').hidden = true;
                document.body.classList.remove('home-active');
                const ws = document.getElementById('game-workspace');
                ws.hidden = false;
                ws.setAttribute('aria-hidden', 'false');
            `
        });
        await new Promise(r => setTimeout(r, 600));

        // Sci-Fi Table
        await send('Runtime.evaluate', {
            expression: `document.body.className = 'cyber-terminal theme-sci-fi theme-background-sci-fi theme-tile-sci-fi theme-table-sci-fi';`
        });
        await new Promise(r => setTimeout(r, 500));
        const ssScifiTable = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(`${EVIDENCE_DIR}/public-scifi-table-embedded-evidence-2026-08-19.png`, Buffer.from(ssScifiTable.data, 'base64'));

        // Classic Table
        await send('Runtime.evaluate', {
            expression: `document.body.className = 'cyber-terminal theme-classic theme-background-classic theme-tile-classic theme-table-classic';`
        });
        await new Promise(r => setTimeout(r, 500));
        const ssClassicTable = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(`${EVIDENCE_DIR}/public-classic-table-embedded-evidence-2026-08-19.png`, Buffer.from(ssClassicTable.data, 'base64'));

        console.log('All theme screenshots captured successfully!');
        ws.close();
    } finally {
        edgeProc.kill();
        localServer.close();
    }
}

runThemeVerification().catch(e => {
    console.error('Error during theme verification:', e);
    process.exit(1);
});
