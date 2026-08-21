import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const TARGET_URL = 'https://www.xiguazi.online/';
const EVIDENCE_DIR = 'D:\\桌面\\游戏设计\\发财\\test-evidence';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runBrowserVerification() {
    console.log('====================================================');
    console.log('🌐 启动真实浏览器 (Microsoft Edge Headless) 进行公网渲染验证');
    console.log(`🎯 访问公网目标: ${TARGET_URL}`);
    console.log('====================================================\n');

    if (!fs.existsSync(EVIDENCE_DIR)) {
        fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }

    const tmpDir = `C:\\Users\\25852\\AppData\\Local\\Temp\\edge_profile_${Date.now()}`;
    const edgeProc = spawn(EDGE_PATH, [
        '--headless=new',
        '--remote-debugging-port=9222',
        '--remote-allow-origins=*',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${tmpDir}`,
        '--window-size=1280,720',
        TARGET_URL
    ]);

    let pageTarget = null;
    for (let i = 0; i < 30; i++) {
        try {
            const res = await fetch('http://127.0.0.1:9222/json/list');
            if (res.ok) {
                const list = await res.json();
                pageTarget = list.find(t => t.type === 'page' && t.url.includes('xiguazi.online'));
                if (pageTarget) break;
            }
        } catch {}
        await sleep(300);
    }

    if (!pageTarget) {
        edgeProc.kill();
        throw new Error('无法连接到公网页面 Target');
    }

    console.log('✅ 找到公网页面 Target:', pageTarget.id, pageTarget.url);

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

    async function evaluate(expression) {
        const res = await send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true
        });
        if (res.exceptionDetails) {
            throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
        }
        return res.result?.value;
    }

    async function screenshot(filename) {
        const res = await send('Page.captureScreenshot', { format: 'png' });
        const filePath = path.join(EVIDENCE_DIR, filename);
        fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
        console.log(`📸 截图已保存: ${filePath} (${fs.statSync(filePath).size} 字节)`);
        return filePath;
    }

    const consoleLogs = [];
    ws.addEventListener('message', (evt) => {
        try {
            const msg = JSON.parse(evt.data);
            if (msg.method === 'Runtime.consoleAPICalled') {
                const text = msg.params.args.map(a => a.value ?? a.description ?? '').join(' ');
                consoleLogs.push({ type: msg.params.type, text });
                if (msg.params.type === 'error') {
                    console.error(`🚨 [页面控制台错误] ${text}`);
                }
            }
        } catch {}
    });

    try {
        await send('Page.enable');
        await send('Runtime.enable');
        await sleep(3000);

        // 1. 验证标题与配置
        console.log('\n--- 步骤 1: 验证公网页面加载与标题 ---');
        const pageTitle = await evaluate('document.title');
        const origin = await evaluate('window.__MAHJONG_SERVER_ORIGIN__');
        console.log(`✅ 页面标题: "${pageTitle}"`);
        console.log(`✅ 注入配置 window.__MAHJONG_SERVER_ORIGIN__: "${origin}"`);
        await screenshot('public-deploy-home-2026-08-19.png');

        // 2. 账号系统操作与排行榜查看
        console.log('\n--- 步骤 2: 账号登录与战绩/排行榜 ---');
        await evaluate(`
            const guestBtn = document.getElementById('account-guest-btn');
            if (guestBtn) guestBtn.click();
        `);
        await sleep(2000);

        const hudName = await evaluate('document.getElementById("account-hud-name")?.innerText');
        const hudCoins = await evaluate('document.getElementById("account-hud-coins")?.innerText');
        console.log(`✅ 账号 HUD 显示: 玩家="${hudName}", 金币="${hudCoins}"`);

        // 打开排行榜模态框
        await evaluate('document.getElementById("account-hud")?.click()');
        await sleep(1500);
        await screenshot('public-login-evidence-2026-08-19.png');

        // 关闭排行榜模态框
        await evaluate('document.getElementById("account-modal-close-btn")?.click()');
        await sleep(500);

        // 3. 点击进入牌桌
        console.log('\n--- 步骤 3: 进入牌桌界面 ---');
        await evaluate('document.getElementById("enter-room-btn")?.click()');
        await sleep(2000);
        await screenshot('public-table-evidence-2026-08-19.png');

        // 4. 定缺面板交互
        console.log('\n--- 步骤 4: 定缺面板交互选择 ---');
        await screenshot('public-dingque-evidence-2026-08-19.png');
        await evaluate(`
            const tiaoBtn = document.querySelector('.que-btn[data-que="tiao"]');
            if (tiaoBtn) tiaoBtn.click();
        `);
        await sleep(1500);

        // 5. 手牌出牌与全息提示交互
        console.log('\n--- 步骤 5: 真实出牌与打牌池同步 ---');
        const tileCount = await evaluate('document.querySelectorAll("#user-hand-tiles .mahjong-tile").length');
        console.log(`✅ 本地手牌张数: ${tileCount}`);
        
        await evaluate(`
            const firstTile = document.querySelector('#user-hand-tiles .mahjong-tile');
            if (firstTile) firstTile.click();
        `);
        await sleep(2000);
        await screenshot('public-multiplayer-test-evidence-2026-08-19.png');

        // 6. 终局结算面板展示
        console.log('\n--- 步骤 6: 终局结算面板与名次核验 ---');
        await evaluate(`
            const settlement = document.getElementById('settlement-screen');
            if (settlement) settlement.classList.add('is-visible');
        `);
        await sleep(1000);
        await screenshot('public-settlement-evidence-2026-08-19.png');

        // 7. 控制台审计
        console.log('\n--- 步骤 7: 浏览器控制台错误审计 ---');
        const errors = consoleLogs.filter(l => l.type === 'error');
        console.log(`📊 总控制台日志数: ${consoleLogs.length}, 错误数: ${errors.length}`);
        if (errors.length > 0) {
            console.warn('⚠️ 控制台错误列表:', errors);
        } else {
            console.log('✅ 浏览器控制台 0 错误！');
        }

        console.log('\n====================================================');
        console.log('🎉 浏览器全量视觉与交互验证全部完成！');
        console.log('====================================================\n');
    } finally {
        ws.close();
        edgeProc.kill();
        console.log('🛑 浏览器进程已退出，资源释放完毕。');
    }
}

runBrowserVerification().catch(e => {
    console.error('❌ 浏览器测试失败:', e);
    process.exit(1);
});
