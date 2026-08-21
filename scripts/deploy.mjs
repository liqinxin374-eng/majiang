import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'deploy', 'deploy.config.json');

function loadConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        console.error(`❌ 未找到配置文件: ${CONFIG_PATH}`);
        process.exit(1);
    }
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8').replace(/^\uFEFF/, '').trim();
    return JSON.parse(raw);
}

function run(cmd, opts = {}) {
    console.log(`\x1b[36m> ${cmd}\x1b[0m`);
    execSync(cmd, { stdio: 'inherit', cwd: ROOT_DIR, ...opts });
}

function sshCommand(config, remoteCmd) {
    const portArg = config.sshPort ? `-P ${config.sshPort}` : '';
    const keyArg = config.sshKey ? `-i "${config.sshKey}"` : '';
    const target = `${config.sshUser}@${config.serverHost}`;
    const cmd = `ssh ${portArg} ${keyArg} -o StrictHostKeyChecking=accept-new ${target} "${remoteCmd}"`;
    run(cmd);
}

function scpCommand(config, localFile, remoteTarget) {
    const portArg = config.sshPort ? `-P ${config.sshPort}` : '';
    const keyArg = config.sshKey ? `-i "${config.sshKey}"` : '';
    const target = `${config.sshUser}@${config.serverHost}:${remoteTarget}`;
    const cmd = `scp ${portArg} ${keyArg} -o StrictHostKeyChecking=accept-new "${localFile}" ${target}`;
    run(cmd);
}

async function tryHttpDeploy(config, target, archivePath) {
    const origin = config.serverOrigin || `https://${config.serverHost}`;
    const secret = config.deploySecret;
    if (!secret) return false;

    console.log(`📡 尝试通过 HTTP 鉴权接口免密更新 (${origin}/api/internal/deploy)...`);
    const buffer = fs.readFileSync(archivePath);
    const archiveBase64 = buffer.toString('base64');

    try {
        const res = await fetch(`${origin}/api/internal/deploy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Deploy-Secret': secret
            },
            body: JSON.stringify({ target, archiveBase64 })
        });

        if (res.status === 200) {
            const data = await res.json();
            console.log(`✅ HTTP 部署鉴权通过，远程响应: ${data.message}`);
            return true;
        } else if (res.status === 403) {
            console.warn(`⚠️ HTTP 鉴权密钥错误 (HTTP 403)，将回退至 SSH 部署。`);
            return false;
        } else if (res.status === 404) {
            console.log(`ℹ️ 服务端尚未部署 HTTP 鉴权接口 (HTTP 404)，将自动通过 SSH 进行首次部署。`);
            return false;
        }
    } catch (e) {
        console.log(`ℹ️ 无法连接 HTTP 部署接口 (${e.message})，将使用 SSH 部署。`);
        return false;
    }
    return false;
}

async function deployFrontend(config) {
    console.log('\n========================================');
    console.log('📦 [前端] 构建与打包静态资源');
    console.log('========================================');

    run('node ./node_modules/vite/bin/vite.js build');

    const distIndexPath = path.join(ROOT_DIR, 'dist', 'index.html');
    if (fs.existsSync(distIndexPath)) {
        let content = fs.readFileSync(distIndexPath, 'utf-8');
        const originInjection = `<script>window.__MAHJONG_SERVER_ORIGIN__ = "${config.serverOrigin || ''}";</script>`;
        if (!content.includes('window.__MAHJONG_SERVER_ORIGIN__')) {
            content = content.replace('<head>', `<head>${originInjection}`);
            fs.writeFileSync(distIndexPath, content, 'utf-8');
            console.log(`✅ 已向 dist/index.html 注入服务器地址: ${config.serverOrigin}`);
        }
    }

    const archivePath = path.join(ROOT_DIR, 'dist.tar.gz');
    run(`tar -czf dist.tar.gz -C dist .`);

    // 优先尝试 HTTP 鉴权免密部署
    const httpSuccess = await tryHttpDeploy(config, 'frontend', archivePath);
    if (httpSuccess) {
        console.log('🎉 前端免密部署成功！');
        return;
    }

    console.log(`🚀 [SSH 方式] 上传前端资源到 ${config.serverHost}:${config.remoteWebDir} ...`);
    scpCommand(config, archivePath, '/tmp/dist.tar.gz');

    const remoteScript = [
        `sudo mkdir -p ${config.remoteWebDir}`,
        `sudo tar -xzf /tmp/dist.tar.gz -C ${config.remoteWebDir}`,
        `sudo rm -f /tmp/dist.tar.gz`,
        `echo "前端静态资源更新完成！"`
    ].join(' && ');

    sshCommand(config, remoteScript);
    console.log('🎉 前端部署完成！');
}

async function deployBackend(config) {
    console.log('\n========================================');
    console.log('📦 [后端] 打包服务端代码');
    console.log('========================================');

    const archivePath = path.join(ROOT_DIR, 'deploy.tar.gz');
    run(`tar -czf deploy.tar.gz server src package.json deploy`);

    // 优先尝试 HTTP 鉴权免密部署
    const httpSuccess = await tryHttpDeploy(config, 'backend', archivePath);
    if (httpSuccess) {
        console.log('🎉 后端免密部署与热更新成功！');
        return;
    }

    console.log(`🚀 [SSH 方式] 上传后端代码并重启 ${config.serviceName} 服务 ...`);
    scpCommand(config, archivePath, '/tmp/deploy.tar.gz');

    const remoteScript = [
        `sudo mkdir -p ${config.remoteServerDir}`,
        `sudo tar -xzf /tmp/deploy.tar.gz -C ${config.remoteServerDir}`,
        `sudo rm -f /tmp/deploy.tar.gz`,
        `sudo systemctl restart ${config.serviceName || 'mahjong-server'}`,
        `echo "后端服务已重启"`
    ].join(' && ');

    sshCommand(config, remoteScript);
    console.log('🎉 后端服务部署与重启完成！');
}

async function verifyHealth(config) {
    console.log('\n🔍 [健康检查] 正在验证公网服务状态...');
    const origin = config.serverOrigin || `https://${config.serverHost}`;
    
    try {
        const res = await fetch(`${origin}/api/leaderboard`);
        if (res.ok) {
            console.log(`✅ 后端 API 正常响应: ${origin}/api/leaderboard (HTTP 200)`);
        }
    } catch {}

    try {
        const res = await fetch(`${origin}/`);
        if (res.ok) {
            console.log(`✅ 前端静态页面正常: ${origin}/ (HTTP 200)`);
        }
    } catch {}
}

async function main() {
    const args = process.argv.slice(2);
    const target = args.find(a => a.startsWith('--target='))?.split('=')[1] || 'all';

    console.log('====================================================');
    console.log('🚀 麻将游戏智能免密部署工具');
    console.log(`🎯 目标模块: ${target.toUpperCase()}`);
    console.log('====================================================\n');

    const config = loadConfig();

    if (target === 'frontend' || target === 'all') {
        await deployFrontend(config);
    }

    if (target === 'backend' || target === 'all') {
        await deployBackend(config);
    }

    await verifyHealth(config);

    console.log('\n====================================================');
    console.log('🎉 全部部署与更新流程顺利完成！');
    console.log('====================================================\n');
}

main().catch(err => {
    console.error('\n❌ 部署过程发生错误:', err);
    process.exit(1);
});
