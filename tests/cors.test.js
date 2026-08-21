import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from '../server/createServer.js';

/**
 * 跨域（CORS）回归测试。
 *
 * ── 为什么单独开一个文件 ──
 * 这是一个「服务端明明正常、前端却完全用不了」的经典陷阱，而且极难从日志看出来：
 *   - curl 调接口：200，数据完整，一切正常。
 *   - 浏览器里调同一个接口：fetch 直接抛 TypeError，
 *     前端只能笼统地报「无法连接服务器」，看不出是被 CORS 拦的。
 *
 * 现实中网页和后端永远不同源：
 *   - 本地开发：网页 127.0.0.1:4173，后端 127.0.0.1:3001，端口不同即跨域。
 *   - 打包成 App：页面来源是 capacitor:// 或 file://，跨得更远。
 *
 * 所以下面这些断言必须一直是绿的，否则登录功能会在真机上整块失效。
 * 注意：这里刻意用原始 fetch 而不是 accountClient，
 * 因为要检查的是 HTTP 响应头本身，客户端封装会把头信息吃掉。
 */

async function withRunningServer(run) {
    const directory = mkdtempSync(join(tmpdir(), 'mahjong-cors-'));
    const { server, accounts } = createAppServer({ databaseFile: join(directory, 'mahjong.db') });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
        await run(`http://127.0.0.1:${port}`);
    } finally {
        await new Promise(resolve => server.close(resolve));
        accounts.close();
        rmSync(directory, { recursive: true, force: true });
    }
}

test('预检请求（OPTIONS）会被放通，而不是撞到「只支持 POST」', async () => {
    await withRunningServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/auth/guest`, {
            method: 'OPTIONS',
            headers: {
                Origin: 'http://127.0.0.1:4173',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'content-type, authorization'
            }
        });

        assert.equal(response.status, 204, 'OPTIONS 必须回 204，回 405 的话浏览器不会再发真正的请求');
        assert.equal(response.headers.get('access-control-allow-origin'), '*');
        assert.match(response.headers.get('access-control-allow-methods') ?? '', /POST/);
    });
});

test('放通的请求头里必须包含 Authorization，否则带令牌的请求过不了预检', async () => {
    await withRunningServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/rooms`, {
            method: 'OPTIONS',
            headers: {
                Origin: 'capacitor://localhost',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'content-type, authorization'
            }
        });

        const allowed = (response.headers.get('access-control-allow-headers') ?? '').toLowerCase();
        assert.match(allowed, /authorization/, '登录后每个请求都带 Bearer 令牌，不放通就全军覆没');
        assert.match(allowed, /content-type/);
    });
});

test('真正的业务响应也要带跨域头，否则浏览器拿不到返回值', async () => {
    await withRunningServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/auth/guest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4173' },
            body: '{}'
        });

        assert.equal(response.status, 201);
        assert.equal(
            response.headers.get('access-control-allow-origin'),
            '*',
            '只在 OPTIONS 上加头是不够的：真实响应缺头，浏览器照样把结果丢掉'
        );
        const payload = await response.json();
        assert.ok(payload.token, '游客登录必须同时下发令牌');
    });
});

test('出错的响应同样要带跨域头，不然前端只能看到「无法连接服务器」', async () => {
    await withRunningServer(async (baseUrl) => {
        // 故意不带令牌建房，服务端会回 401。
        const response = await fetch(`${baseUrl}/api/rooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4173' },
            body: JSON.stringify({ player: { name: '路人甲乙' } })
        });

        assert.equal(response.status, 401);
        assert.equal(response.headers.get('access-control-allow-origin'), '*');
        // 头齐全，前端才能读到这句话并把玩家送回登录页；
        // 缺头的话错误信息会被浏览器一起丢掉，玩家永远看不到真正原因。
        const payload = await response.json();
        assert.match(payload.error, /请先登录/);
    });
});

test('GET 类接口的跨域头也不能漏', async () => {
    await withRunningServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/leaderboard`, {
            headers: { Origin: 'http://127.0.0.1:4173' }
        });

        assert.equal(response.status, 200);
        assert.equal(response.headers.get('access-control-allow-origin'), '*');
    });
});
