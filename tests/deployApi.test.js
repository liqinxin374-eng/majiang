import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from '../server/createServer.js';

async function withRunningServer(run) {
    const directory = mkdtempSync(join(tmpdir(), 'mahjong-deploy-'));
    const { server, accounts } = createAppServer({ databaseFile: join(directory, 'mahjong.db') });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
        await run(`http://127.0.0.1:${port}`, directory);
    } finally {
        await new Promise(resolve => server.close(resolve));
        accounts.close();
        rmSync(directory, { recursive: true, force: true });
    }
}

test('deploy endpoint rejects requests without correct secret', async () => {
    await withRunningServer(async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/internal/deploy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Deploy-Secret': 'wrong-secret' },
            body: JSON.stringify({ target: 'frontend', archiveBase64: 'abc' })
        });
        assert.equal(res.status, 403);
        const data = await res.json();
        assert.match(data.error, /密钥不匹配/);
    });
});

test('deploy endpoint rejects requests missing archive payload', async () => {
    await withRunningServer(async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/internal/deploy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Deploy-Secret': 'mahjong_deploy_secret_2026_xiguazi' },
            body: JSON.stringify({ target: 'frontend' })
        });
        assert.equal(res.status, 400);
        const data = await res.json();
        assert.match(data.error, /缺少发布包/);
    });
});
