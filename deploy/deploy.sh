#!/usr/bin/env bash
# 麻将联机服务器 一键部署脚本（在腾讯云 Lighthouse Ubuntu 24.04 上运行）
# 用法：把本 deploy 目录传到服务器后，cd 进去执行 `sudo bash deploy.sh`
set -euo pipefail

APP_DIR="/opt/mahjong-server"
PORT="${PORT:-3001}"
NODE_MAJOR=22
NODE_VER="v22.22.2"
NODE_URL="https://registry.npmmirror.com/-/binary/node/${NODE_VER}/node-${NODE_VER}-linux-x64.tar.xz"

echo "==> [1/5] 检查 Node.js"
NEED_INSTALL=0
if ! command -v node >/dev/null 2>&1; then
  NEED_INSTALL=1
else
  CURRENT_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
  if [ "${CURRENT_MAJOR}" -lt "${NODE_MAJOR}" ]; then
    NEED_INSTALL=1
  fi
fi

if [ "${NEED_INSTALL}" -eq 1 ]; then
  echo "    Node 缺失或版本 < ${NODE_MAJOR}，从 npmmirror 安装 ${NODE_VER} ..."
  curl -fsSL "${NODE_URL}" -o /tmp/node.tar.xz
  tar -xf /tmp/node.tar.xz -C /usr/local --strip-components=1
  rm -f /tmp/node.tar.xz
fi
NODE_BIN="$(command -v node)"
echo "    Node 版本: $(node -v)  (${NODE_BIN})"

echo "==> [2/5] 拷贝代码到 ${APP_DIR}"
mkdir -p "${APP_DIR}"
rm -rf "${APP_DIR}/server" "${APP_DIR}/src"
cp -r ./server "${APP_DIR}/server"
# server/roomService.js 会 import ../src/mahjongCore.js（服务端权威发牌与结算要用），
# 少了这个目录服务起不来，所以必须一起部署。
cp -r ./src "${APP_DIR}/src"
if [ -f ./package.json ]; then
  cp ./package.json "${APP_DIR}/package.json"
else
  printf '{"name":"mahjong-server","version":"1.0.0","type":"module","scripts":{"start":"node server/index.js"}}' > "${APP_DIR}/package.json"
fi

echo "==> [3/5] 注册 systemd 服务"
cat > /etc/systemd/system/mahjong-server.service <<EOF
[Unit]
Description=Mahjong multiplayer server
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
ExecStart=${NODE_BIN} ${APP_DIR}/server/index.js
Environment=PORT=${PORT}
Environment=HOST=0.0.0.0
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now mahjong-server

echo "==> [4/5] 系统防火墙放通 ${PORT}/tcp"
if command -v ufw >/dev/null 2>&1; then
  ufw allow "${PORT}/tcp" || true
fi

echo "==> [5/5] 完成"
echo "    本机自测: curl http://127.0.0.1:${PORT}/api/leaderboard"
echo "    务必再到 腾讯云 Lighthouse 控制台 -> 防火墙 放通 TCP ${PORT}（控制台防火墙脚本改不了）"
systemctl status mahjong-server --no-pager || true
