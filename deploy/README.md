# 麻将联机服务器 · 腾讯云 Lighthouse 部署指南

把本工作区的 `server/`（Node 联机服务器，监听 `0.0.0.0:3001`，HTTP + WebSocket）部署到一台腾讯云轻量应用服务器（Lighthouse，中国大陆节点，Ubuntu 24.04 系统镜像）。

> 本服务器**零第三方依赖**，只用 Node 内置模块（`node:http`、`node:crypto`、`node:sqlite`），无需 `npm install`。

## 一、前置条件

| 项目 | 要求 |
| --- | --- |
| 镜像 | 腾讯云 Lighthouse **系统镜像** → Ubuntu 24.04 LTS（不要用 OpenClaw 应用镜像） |
| 配置 | 2 核 4G 起步 |
| Node | ≥ 22.5（内置 `node:sqlite`；脚本默认装 v22.22.2） |
| 端口 | TCP **3001** 入站放通 |
| 客户端 | `VITE_SERVER_ORIGIN=http://公网IP:3001` |

## 二、本地打包（已在本仓库 `deploy/` 完成，可直接用）

```bash
# 在仓库根目录执行，生成可上传的压缩包
tar czf deploy.tar.gz -C deploy .
```

`deploy/` 内含：`server/`（全部源码 + `database/schema.sql`）、`package.json`、`deploy.sh`、`mahjong-server.service`。

## 三、上传并在服务器执行

```bash
# 1) 把压缩包传到服务器（替换 公网IP）
scp deploy.tar.gz root@公网IP:/tmp/

# 2) 登录服务器
ssh root@公网IP

# 3) 在服务器上解压并一键部署
cd /tmp && tar xzf deploy.tar.gz && cd deploy
sudo bash deploy.sh
```

脚本会自动：装 Node 22 → 拷贝代码到 `/opt/mahjong-server` → 注册并启动 systemd 服务 → 系统防火墙放通 3001。

## 四、控制台防火墙（必须手工做，脚本改不了）

腾讯云 Lighthouse 的防火墙在控制台，不在系统里：

1. 打开 **Lighthouse 控制台 → 实例 → 防火墙**
2. 添加规则：**自定义 / TCP / 3001 / 允许 / 来源 `0.0.0.0/0`**
3. 保存

> 只放通系统防火墙（`ufw`）不够，控制台防火墙不放通，外部依然连不进来。

## 五、验证

```bash
# 服务器本机
curl http://127.0.0.1:3001/api/leaderboard

# 外部（换你自己的电脑 / 手机，或另一台机器）
curl http://公网IP:3001/api/leaderboard
```

两条都应返回 JSON。手机联机时，游戏前端填 `http://公网IP:3001`（即 `VITE_SERVER_ORIGIN`）。

## 六、自动化一键构建与部署（推荐）

本工作区已内置全自动一键打包、上传、更新与健康检查脚本，支持 Windows 原生 PowerShell 与跨平台 Node 命令：

### 1. 配置服务器信息 (`deploy/deploy.config.json`)

```json
{
  "serverHost": "www.xiguazi.online",
  "sshUser": "root",
  "sshPort": 22,
  "sshKey": "",
  "remoteWebDir": "/var/www/html",
  "remoteServerDir": "/opt/mahjong-server",
  "serverOrigin": "https://www.xiguazi.online",
  "serviceName": "mahjong-server"
}
```

### 2. 执行一键部署命令

```bash
# 全量更新（前端打包 + 后端更新并重启 + 健康检查）
npm run deploy

# 仅更新前端静态网页（编译 Vite、上传 assets/ 及所有图片、更新 Nginx）
npm run deploy:frontend

# 仅更新后端规则与服务（打包 server/src、上传、重启 systemd）
npm run deploy:backend
```

或使用 Windows PowerShell 原生脚本：
```powershell
.\scripts\deploy_remote.ps1 -Target all
.\scripts\deploy_remote.ps1 -Target frontend
.\scripts\deploy_remote.ps1 -Target backend
```

---

## 七、常用运维命令

```bash
systemctl status mahjong-server     # 查看状态
systemctl restart mahjong-server    # 重启
journalctl -u mahjong-server -f     # 看日志
```

数据库文件在 `/opt/mahjong-server/server/database/mahjong.db`，建议开启 Lighthouse **自动快照**做备份；也可用 `MAHJONG_DB_FILE` 环境变量指定到固定路径。
