import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const EVIDENCE_DIR = 'test-evidence';

// Simple static server for local workspace files
function createStaticServer(port = 8765) {
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
        
        let filePath;
        if (reqPath.startsWith('/themes/')) {
            filePath = path.join(process.cwd(), 'public', reqPath);
        } else {
            filePath = path.join(process.cwd(), reqPath);
        }

        if (!fs.existsSync(filePath)) {
            const pubPath = path.join(process.cwd(), 'public', reqPath);
            if (fs.existsSync(pubPath)) {
                filePath = pubPath;
            } else {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    });

    return new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => resolve(server));
    });
}

async function run() {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    const server = await createStaticServer(8765);
    console.log('Local test server listening at http://127.0.0.1:8765');

    const tmpDir = `C:\\Users\\25852\\AppData\\Local\\Temp\\edge_profile_bg_${Date.now()}`;
    const edge = spawn(EDGE_PATH, [
        '--headless=new',
        '--remote-debugging-port=9223',
        '--remote-allow-origins=*',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${tmpDir}`,
        '--window-size=1280,720',
        'http://127.0.0.1:8765/index.html'
    ]);

    try {
        let connected = false;
        for (let i = 0; i < 30; i++) {
            try {
                const res = await fetch('http://127.0.0.1:9223/json/list');
                if (res.ok) {
                    const list = await res.json();
                    const pageTarget = list.find(t => t.type === 'page' && t.url.includes('127.0.0.1:8765'));
                    if (pageTarget) {
                        console.log('Found test target:', pageTarget.id);
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

                        // 1. Capture Sci-Fi Home Background
                        await send('Runtime.evaluate', {
                            expression: `
                                document.body.className = 'cyber-terminal theme-sci-fi theme-background-sci-fi home-active';
                            `
                        });
                        await new Promise(r => setTimeout(r, 600));
                        let ssRes = await send('Page.captureScreenshot', { format: 'png' });
                        const scifiHomePath = `${EVIDENCE_DIR}/mahjong-scifi-bg-evidence-2026-08-19.png`;
                        fs.writeFileSync(scifiHomePath, Buffer.from(ssRes.data, 'base64'));
                        console.log('Saved Sci-Fi Home evidence to:', scifiHomePath);

                        // 2. Capture Classic Guofeng Home Background
                        await send('Runtime.evaluate', {
                            expression: `
                                document.body.className = 'cyber-terminal theme-classic theme-background-classic home-active';
                            `
                        });
                        await new Promise(r => setTimeout(r, 600));
                        ssRes = await send('Page.captureScreenshot', { format: 'png' });
                        const classicHomePath = `${EVIDENCE_DIR}/mahjong-classic-bg-evidence-2026-08-19.png`;
                        fs.writeFileSync(classicHomePath, Buffer.from(ssRes.data, 'base64'));
                        console.log('Saved Classic Guofeng Home evidence to:', classicHomePath);

                        // 3. Capture Sci-Fi Gameplay Table Background
                        await send('Runtime.evaluate', {
                            expression: `
                                document.body.className = 'cyber-terminal theme-sci-fi theme-background-sci-fi';
                                const enterBtn = document.getElementById('enter-room-btn');
                                if (enterBtn) enterBtn.click();
                            `
                        });
                        await new Promise(r => setTimeout(r, 1200));
                        ssRes = await send('Page.captureScreenshot', { format: 'png' });
                        const scifiGamePath = `${EVIDENCE_DIR}/mahjong-game-scifi-bg-evidence-2026-08-19.png`;
                        fs.writeFileSync(scifiGamePath, Buffer.from(ssRes.data, 'base64'));
                        console.log('Saved Sci-Fi Game Table evidence to:', scifiGamePath);

                        // 4. Capture Classic Guofeng Gameplay Table Background
                        await send('Runtime.evaluate', {
                            expression: `
                                document.body.className = 'cyber-terminal theme-classic theme-background-classic theme-table-classic theme-tile-classic';
                            `
                        });
                        await new Promise(r => setTimeout(r, 800));
                        ssRes = await send('Page.captureScreenshot', { format: 'png' });
                        const classicGamePath = `${EVIDENCE_DIR}/mahjong-game-classic-bg-evidence-2026-08-19.png`;
                        fs.writeFileSync(classicGamePath, Buffer.from(ssRes.data, 'base64'));
                        console.log('Saved Classic Guofeng Game Table evidence to:', classicGamePath);

                        ws.close();
                        connected = true;
                        break;
                    }
                }
            } catch (e) {}
            await new Promise(r => setTimeout(r, 400));
        }

        if (!connected) {
            throw new Error('Failed to connect to headless browser target');
        }
    } finally {
        edge.kill();
        server.close();
    }
}

run().catch(e => {
    console.error('Error running verification:', e);
    process.exit(1);
});
