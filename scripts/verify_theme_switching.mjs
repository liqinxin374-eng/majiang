import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const EVIDENCE_DIR = 'test-evidence';

function createStaticServer(port = 8775) {
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
        
        let filePath = path.normalize(path.join(process.cwd(), reqPath));

        if (!fs.existsSync(filePath)) {
            const pubPath = path.normalize(path.join(process.cwd(), 'public', reqPath));
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

async function run() {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    const localServer = await createStaticServer(8775);
    const tmpDir = `C:\\Users\\25852\\AppData\\Local\\Temp\\edge_verify_theme_${Date.now()}`;
    const edgeProc = spawn(EDGE_PATH, [
        '--headless=new',
        '--remote-debugging-port=9233',
        '--remote-allow-origins=*',
        '--no-proxy-server',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${tmpDir}`,
        '--window-size=1280,720',
        'http://127.0.0.1:8775/index.html'
    ]);

    try {
        let pageTarget = null;
        for (let i = 0; i < 30; i++) {
            try {
                const res = await fetch('http://127.0.0.1:9233/json/list');
                if (res.ok) {
                    const list = await res.json();
                    pageTarget = list.find(t => t.type === 'page' && t.url.includes('127.0.0.1:8775'));
                    if (pageTarget) break;
                }
            } catch {}
            await new Promise(r => setTimeout(r, 300));
        }

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

        ws.addEventListener('message', (evt) => {
            const data = JSON.parse(evt.data);
            if (data.method === 'Runtime.consoleAPICalled') {
                console.log('[Browser Console]', data.params.type, data.params.args.map(a => a.value || a.description).join(' '));
            }
        });

        await send('Page.enable');
        await send('Runtime.enable');
        await new Promise(r => setTimeout(r, 2000));

        // 1. Initial Sci-Fi Home Screenshot
        console.log('1. Capturing Initial Sci-Fi Home...');
        const ss1 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(`${EVIDENCE_DIR}/live-switch-1-scifi-home-evidence-2026-08-19.png`, Buffer.from(ss1.data, 'base64'));

        // 2. Click Classic Guofeng Theme Button
        console.log('2. Clicking Classic Guofeng Theme Button...');
        await send('Runtime.evaluate', {
            expression: `document.querySelector('.theme-toggle-btn[data-theme="classic"]').click()`
        });
        await new Promise(r => setTimeout(r, 600));
        const ss2 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(`${EVIDENCE_DIR}/live-switch-2-classic-home-evidence-2026-08-19.png`, Buffer.from(ss2.data, 'base64'));

        // 3. Click Xianxia Theme Button
        console.log('3. Clicking Xianxia Theme Button...');
        await send('Runtime.evaluate', {
            expression: `document.querySelector('.theme-toggle-btn[data-theme="xianxia"]').click()`
        });
        await new Promise(r => setTimeout(r, 600));
        const ss3 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(`${EVIDENCE_DIR}/live-switch-3-xianxia-home-evidence-2026-08-19.png`, Buffer.from(ss3.data, 'base64'));

        // 4. Enter Room & Click Switch to Classic on Table
        console.log('4. Entering Room & Testing Table Live Switch to Classic...');
        await send('Runtime.evaluate', {
            expression: `document.getElementById('enter-room-btn').click()`
        });
        await new Promise(r => setTimeout(r, 800));

        await send('Runtime.evaluate', {
            expression: `document.querySelector('.theme-toggle-btn[data-theme="classic"]').click()`
        });
        await new Promise(r => setTimeout(r, 600));
        const ss4 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(`${EVIDENCE_DIR}/live-switch-4-classic-table-evidence-2026-08-19.png`, Buffer.from(ss4.data, 'base64'));

        // 5. In-game Switch to Sci-Fi on Table
        console.log('5. In-game Testing Table Live Switch to Sci-Fi...');
        await send('Runtime.evaluate', {
            expression: `document.querySelector('.theme-toggle-btn[data-theme="sci-fi"]').click()`
        });
        await new Promise(r => setTimeout(r, 600));
        const ss5 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(`${EVIDENCE_DIR}/live-switch-5-scifi-table-evidence-2026-08-19.png`, Buffer.from(ss5.data, 'base64'));

        console.log('All live theme switching tests completed successfully!');
        ws.close();
    } finally {
        edgeProc.kill();
        localServer.close();
    }
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
