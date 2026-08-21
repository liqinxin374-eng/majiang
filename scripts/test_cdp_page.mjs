import { spawn } from 'node:child_process';
import fs from 'node:fs';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const EVIDENCE_PATH = 'test-evidence/public-deploy-home-2026-08-19.png';

async function run() {
    const tmpDir = `C:\\Users\\25852\\AppData\\Local\\Temp\\edge_profile_${Date.now()}`;
    const edge = spawn(EDGE_PATH, [
        '--headless=new',
        '--remote-debugging-port=9222',
        '--remote-allow-origins=*',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${tmpDir}`,
        '--window-size=1280,720',
        'https://www.xiguazi.online/'
    ]);

    for (let i = 0; i < 30; i++) {
        try {
            const res = await fetch('http://127.0.0.1:9222/json/list');
            if (res.ok) {
                const list = await res.json();
                const pageTarget = list.find(t => t.type === 'page' && t.url.includes('xiguazi.online'));
                if (pageTarget) {
                    console.log('Found page target:', pageTarget.id, pageTarget.url);
                    
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
                    await new Promise(r => setTimeout(r, 3000));

                    const evalTitle = await send('Runtime.evaluate', { expression: 'document.title' });
                    console.log('Title:', evalTitle.result?.value);

                    const evalOrigin = await send('Runtime.evaluate', { expression: 'window.__MAHJONG_SERVER_ORIGIN__' });
                    console.log('Server Origin:', evalOrigin.result?.value);

                    const ssRes = await send('Page.captureScreenshot', { format: 'png' });
                    fs.writeFileSync(EVIDENCE_PATH, Buffer.from(ssRes.data, 'base64'));
                    console.log('Screenshot saved to:', EVIDENCE_PATH, 'size:', fs.statSync(EVIDENCE_PATH).size);

                    ws.close();
                    edge.kill();
                    return;
                }
            }
        } catch {}
        await new Promise(r => setTimeout(r, 400));
    }
    edge.kill();
    throw new Error('Target not found');
}

run().catch(e => { console.error(e); process.exit(1); });
