import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const EVIDENCE_DIR = 'test-evidence';

function createStaticServer(port = 8767) {
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

async function run() {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    const server = await createStaticServer(8767);
    console.log('Local test server listening at http://127.0.0.1:8767');

    const tmpDir = `C:\\Users\\25852\\AppData\\Local\\Temp\\edge_profile_settings2_${Date.now()}`;
    const edge = spawn(EDGE_PATH, [
        '--headless=new',
        '--remote-debugging-port=9225',
        '--remote-allow-origins=*',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${tmpDir}`,
        '--window-size=1280,720',
        'http://127.0.0.1:8767/index.html'
    ]);

    try {
        let connected = false;
        for (let i = 0; i < 30; i++) {
            try {
                const res = await fetch('http://127.0.0.1:9225/json/list');
                if (res.ok) {
                    const list = await res.json();
                    const pageTarget = list.find(t => t.type === 'page' && t.url.includes('127.0.0.1:8767'));
                    if (pageTarget) {
                        const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
                        await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

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
                        await new Promise(r => setTimeout(r, 2000));

                        // Force switch into game workspace and display settings panel directly
                        await send('Runtime.evaluate', {
                            expression: `
                                document.getElementById('home-screen').hidden = true;
                                document.body.classList.remove('home-active');
                                const ws = document.getElementById('game-workspace');
                                ws.hidden = false;
                                ws.setAttribute('aria-hidden', 'false');
                                const sp = document.getElementById('settings-panel');
                                sp.hidden = false;
                            `
                        });
                        await new Promise(r => setTimeout(r, 800));

                        // Verify display state
                        const evalDisplay = await send('Runtime.evaluate', {
                            expression: `
                                const row = document.getElementById('settings-server-row');
                                row ? window.getComputedStyle(row).display : 'not_found';
                            `
                        });
                        console.log('settings-server-row computed display:', evalDisplay.result?.value);

                        const ssRes = await send('Page.captureScreenshot', { format: 'png' });
                        const settingsPath = `${EVIDENCE_DIR}/settings-server-origin-hidden-evidence-2026-08-19.png`;
                        fs.writeFileSync(settingsPath, Buffer.from(ssRes.data, 'base64'));
                        console.log('Saved open settings panel evidence to:', settingsPath);

                        ws.close();
                        connected = true;
                        break;
                    }
                }
            } catch (e) {}
            await new Promise(r => setTimeout(r, 400));
        }
        if (!connected) throw new Error('Could not connect to headless browser');
    } finally {
        edge.kill();
        server.close();
    }
}

run().catch(e => {
    console.error('Error running verification:', e);
    process.exit(1);
});
