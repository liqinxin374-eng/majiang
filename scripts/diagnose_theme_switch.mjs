import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function createStaticServer(port = 8774) {
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
                console.log('[HTTP 404]', req.url, '-> tried:', filePath);
                res.writeHead(404);
                res.end('Not found');
                return;
            }
        }

        console.log('[HTTP 200]', req.url, '-> found:', filePath);
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
    });

    return new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => resolve(server));
    });
}

async function run() {
    const localServer = await createStaticServer(8774);
    const tmpDir = `C:\\Users\\25852\\AppData\\Local\\Temp\\edge_debug4_${Date.now()}`;
    const edgeProc = spawn(EDGE_PATH, [
        '--headless=new',
        '--remote-debugging-port=9232',
        '--remote-allow-origins=*',
        '--no-proxy-server',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${tmpDir}`,
        '--window-size=1280,720',
        'http://127.0.0.1:8774/index.html'
    ]);

    try {
        let pageTarget = null;
        for (let i = 0; i < 30; i++) {
            try {
                const res = await fetch('http://127.0.0.1:9232/json/list');
                if (res.ok) {
                    const list = await res.json();
                    pageTarget = list.find(t => t.type === 'page' && t.url.includes('127.0.0.1:8774'));
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
            } else if (data.method === 'Runtime.exceptionThrown') {
                console.error('[Browser Exception]', data.params.exceptionDetails);
            }
        });

        await send('Page.enable');
        await send('Runtime.enable');
        await new Promise(r => setTimeout(r, 2000));

        ws.close();
    } finally {
        edgeProc.kill();
        localServer.close();
    }
}

run().catch(console.error);
