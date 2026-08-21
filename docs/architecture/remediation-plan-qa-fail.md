# QA 门控 FAIL 修复方案（BUG-001 / BUG-002 / BUG-003）

- 文档编号：REM-QAFAIL-001
- 任务编号：ENG-FIX-QAFAIL
- 责任人：主程（engineering-lead / 程基岩）
- 目标范围：完整产品（联网 + 账号金币全修）
- 状态：方案已定稿，进入实施
- 引擎/运行时：Node.js v22.22.2、Vite 5.4.21、Capacitor 8.4.2、原生 JavaScript（无框架）

---

## 0. 总体判断

三个缺陷指向同一个系统性问题：**「服务端单元测试通过」被误当成「功能已交付」**。

| 层次 | 现状 | 缺陷 |
| --- | --- | --- |
| 服务端业务逻辑 | 有实现、有单测（108 项全过） | 正常 |
| 服务端持久化 | schema.sql 只被"文本正则"测试，运行时从未加载 | BUG-003 |
| 前端 ↔ 服务端 HTTP 集成 | 完全不存在（零 fetch） | BUG-002 |
| 前端 ↔ 服务端 WS 地址解析 | 从 `location.hostname` 推导，包内必然错 | BUG-001 |

因此本次修复不仅要补代码，还必须**同步补上能真正照到集成层的测试**，否则同类假阳性会再次发生。修复原则：

1. 服务端对外契约（接口路径、返回字段、错误文案）保持不变，避免连锁返工。
2. `src/mahjongCore.js` 规则引擎**一行都不动**。
3. 每个缺陷都要有「自动化测试」或「明确到按钮级的手动验证步骤」兜底。

---

## 1. BUG-001【Blocker】包内联网连不上服务器

### 1.1 根因

`src/app/main.js` 三处（1538-1539、1580-1581、1642-1643 行）用同一段推导逻辑拼 WebSocket 地址：

```js
const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const host = window.location.hostname || 'localhost';
ROOM_SOCKET = new WebSocket(`${protocol}://${host}:3001/ws`);
```

这段代码隐含了一个只在「浏览器直连开发机」时才成立的假设：**页面的来源地址 == 后端的地址**。

在 Capacitor 打包环境里这个假设彻底不成立：

- Capacitor 8 的 Android 默认 `androidScheme` 为 `https`，页面 origin 是 `https://localhost`；iOS 为 `capacitor://localhost`。
- 于是 `protocol === 'https:'` → 取 `wss`；`hostname` → `localhost`。
- 最终连接目标是 `wss://localhost:3001/ws`，即**手机连自己**，而手机上根本没有服务端进程。
- 即使把地址改对，`server/index.js` 是 `http.createServer()` 纯明文，不支持 TLS，`wss://` 依然握手失败。

双重失败叠加，导致四台真机 100% 卡在"创建房间"。

### 1.2 选型理由：为什么用显式配置而不是继续推导

| 备选方案 | 评价 | 结论 |
| --- | --- | --- |
| A. 继续从 `location` 推导，但排除 localhost | 治标不治本，包内没有任何信息能推出后端 IP | 否决 |
| B. 内网组播/mDNS 自动发现 | 需要原生插件，Android/iOS 权限差异大，超出本次范围 | 否决 |
| C. **显式服务端地址配置（单一入口）** | 构建期可注入、运行期可覆盖，Web/包内行为统一，可测试 | **采纳** |
| D. 把服务端打进 App 本地跑 | 违背联机语义 | 否决 |

采纳 C，并设计**四级优先级**，兼顾开发便利、运维可改、QA 可现场切换：

```
1) localStorage['mahjong.serverOrigin']        运行期覆盖（QA/客服现场切换，免重装）
2) window.__MAHJONG_SERVER_ORIGIN__            部署期覆盖（可直接改 dist/index.html，免重新构建）
3) import.meta.env.VITE_SERVER_ORIGIN          构建期注入（CI 的正式来源）
4) 仅「非打包的浏览器环境」才回落到 location 推导（本地 dev 便利）
5) 打包环境且以上都没有 → 抛出明确中文错误，不再静默连 localhost
```

第 5 条是关键：**把"静默连错地址"变成"大声报错"**。原来的 bug 之所以要靠四台真机才发现，就是因为它失败得太安静。

TLS 策略：
- **开发/内网联调**：允许 `ws://` 明文。需要在 `capacitor.config.json` 打开 `cleartext` 与 `allowMixedContent`，否则 WebView 会以混合内容策略拦截 `https://localhost` 页面发起的 `ws://` 连接。
- **生产**：必须 `wss://`，由**反向代理（Nginx/Caddy）终止 TLS** 后转发到 `http://127.0.0.1:3001`。不在 Node 里塞证书——证书轮换、SNI、HTTP/2 交给成熟组件更稳。这一条写入部署说明，属于运维前置条件。

### 1.3 改动点

| 文件 | 改动 |
| --- | --- |
| `src/config.js`（**新建**） | 唯一配置入口，导出 `SERVER_HTTP_URL` / `SERVER_WS_URL` / `resolveServerOrigin()` / `setServerOriginOverride()` / `isPackagedRuntime()` |
| `src/app/main.js` 1538-1541 | `createOnlineRoom()` 改用 `SERVER_WS_URL` |
| `src/app/main.js` 1580-1583 | `joinOnlineRoom()` 改用 `SERVER_WS_URL` |
| `src/app/main.js` 1642-1645 | `reconnectOnlineRoom()` 改用 `SERVER_WS_URL` |
| `src/app/main.js` 顶部 | 新增 `import { SERVER_WS_URL } from '../config.js'`，并抽出 `openRoomSocket()` 统一建连 + 统一错误提示 |
| `capacitor.config.json` | 新增 `server.androidScheme: "https"`（显式钉住，与 Capacitor 8 默认一致，避免升级漂移导致 localStorage 丢失）、`server.cleartext: true`、`android.allowMixedContent: true` |
| `.env.example`（**新建**） | 说明 `VITE_SERVER_ORIGIN` 用法 |

> 注：显式写 `androidScheme: "https"` 而非改成别的值，是因为 Capacitor 4 起 Android 默认就是 `https`。保持一致 → 现有用户的 localStorage（主题、设置、房间号）不会因 origin 变化而丢失。这是一个**有意的"不改变行为、只固定行为"**的动作。

### 1.4 自测方法

- **自动化**：`tests/config.test.js` 覆盖四级优先级、包内无配置时报错、`http→ws` / `https→wss` 协议换算、尾斜杠归一化。
- **手动（Web）**：`npm run server` + `npm run dev`，点"创建联机房间"，应显示房间号。
- **手动（包内）**：构建时 `VITE_SERVER_ORIGIN=http://<开发机内网IP>:3001` → `cap sync android` → 真机点"创建联机房间"。
- **手动（负向）**：不注入任何配置直接打包 → 点击后应看到明确中文提示「未配置服务器地址…」，而**不是**转圈或"房间服务器未启动"。这一条是本次最重要的回归验证点。

---

## 2. BUG-002【Blocker】账号/金币/战绩/排行榜前端零接入

### 2.1 根因

前端从未调用过任何 HTTP 接口。`src/app/main.js` 与 `index.html` 中 `fetch(` 命中数为 0，`account|login|coins|leaderboard` 命中数为 0。服务端 `/api/auth/*`、`/api/users/:id/*`、`/api/matches`、`/api/leaderboard` 全部处于"有实现、有单测、无人调用"状态。

`ONLINE_PLAYER` 是纯本地对象（`{ id: 'south-<随机>', name: '你' }`），与账号系统毫无关系——所以就算联机通了，服务端也认不出这是谁，金币和战绩无从落到人头上。

### 2.2 服务端契约核对（已读 `server/index.js` 逐行确认）

| 方法 | 路径 | 请求体 | 成功响应 |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | `{username, password}` | 201 `{user:{id,username,isGuest,coins}}` |
| POST | `/api/auth/login` | `{username, password}` | 200 `{user:{...}}` |
| POST | `/api/auth/guest` | `{}` | 201 `{user:{...}}` |
| GET | `/api/users/:id` | — | 200 `{user:{...,createdAt,stats:{games,wins}}}` |
| GET | `/api/users/:id/coins` | — | 200 `{userId, coins}` |
| GET | `/api/users/:id/matches` | — | 200 `{matches:[{id,roomNumber,finishedAt,status,userId,seat,scoreDelta,isWinner}]}` |
| POST | `/api/matches` | `{roomNumber, playerResults[4]}` | 201 `{match:{...}}` |
| GET | `/api/leaderboard` | — | 200 `{leaderboard:[{rank,id,username,isGuest,coins,stats}]}` |

失败一律 `400 {error: '中文原因'}`（未知路径 404、非 POST 且非上述 GET 为 405）。**前端必须读 `error` 字段展示，而不是展示 HTTP 状态码。**

> ⚠️ 已发现契约细节：`GET /api/users/...` 用 `request.url.split('/')` 解析，`pathParts[3]` 即 userId。userId 是 `crypto.randomUUID()`，不含斜杠，安全。但**带 query string 时会污染**（如 `/api/users/xxx/matches?limit=5` → `pathParts[4] === 'matches?limit=5'`）。故前端**一律不带 query**，`limit` 用服务端默认值。此项记录为已知技术债，不在本次范围内改服务端。

### 2.3 选型理由：登录态存哪里

| 备选 | 评价 | 结论 |
| --- | --- | --- |
| Cookie / Session | 服务端目前无 session 中间件、无 CSRF 防护，Capacitor 跨 origin cookie 在 iOS 上限制多 | 否决 |
| JWT | 服务端未签发 token，需要改动认证层，超出"不改契约"边界 | 本次否决，列为后续 |
| **localStorage 存公开用户对象** | 与服务端现有契约完全匹配（登录只返回公开字段，无敏感信息），Capacitor 全平台可用，与项目现有 `localStorage` 用法一致 | **采纳** |

采纳 localStorage，键名 `mahjong.session`，只存服务端返回的 `{id, username, isGuest, coins}`——**不存密码、不存 hash**。

必须明确写下这个方案的**安全边界**：当前服务端接口没有鉴权，任何人知道 userId 就能读该用户资料。这在"内网/熟人房"阶段可接受，但**对外公网发布前必须补 token 鉴权**。此项作为风险上报主理人，不在本次修复范围（改动认证层会破坏"契约不变"约束，需单独排期）。

### 2.4 改动点

| 文件 | 改动 |
| --- | --- |
| `src/accountClient.js`（**新建**） | 纯函数式 API 客户端：`register/login/loginAsGuest/fetchProfile/fetchCoins/fetchMatches/fetchLeaderboard`，统一错误解包（读 `error` 字段）、统一超时（8s，`AbortController`）。**不碰 DOM**，因此可单测。 |
| `src/sessionStore.js`（**新建**） | 登录态读写：`loadSession/saveSession/clearSession/updateSessionCoins`。依赖注入 storage，便于测试。 |
| `index.html` | 首页新增"账号面板"（注册/登录/游客三入口 + 错误提示区）；顶栏新增账号 HUD（昵称 + 金币）；新增"我的战绩"和"排行榜"弹层 |
| `src/app/main.js` | 接线：启动时恢复会话 → 渲染 HUD；登录成功后把 `ONLINE_PLAYER.id/name` 覆盖为真实账号；进入房间前校验已登录；战绩/排行榜按钮拉取并渲染 |
| `style.css` | 账号面板与 HUD 样式 |

`ONLINE_PLAYER` 当前是 `const`（main.js:260）。采取**就地改属性**（`ONLINE_PLAYER.id = user.id`）而非改成 `let`，把改动面压到最小，避免影响 1490/1544/1586/1607/1616/1623/1647 等 7 处引用。

### 2.5 自测方法

- **自动化**：`tests/accountClient.test.js`（注入 mock fetch，覆盖成功/后端 400/网络异常/超时/错误文案透传）、`tests/sessionStore.test.js`（注入 mock storage，覆盖存取/清除/损坏 JSON 容错）。
- **自动化（堵假阳性的关键一环）**：`tests/apiContract.test.js` —— **真正启动 `server/index.js` 的 HTTP server，用真实 `fetch` 打一遍全部账号接口**。这条测试如果前端和服务端字段对不上就会红，正是这次缺失的那一层。
- **手动**：`npm run server` + `npm run dev` → 首页点"游客试玩"，顶栏出现「游客xxxxxx · 1000 金币」→ 刷新页面仍在登录态 → 点"排行榜"看到自己 → 点"注册"建号并重新登录。

---

## 3. BUG-003【Critical】账号数据纯内存，重启即清零

### 3.1 根因

`server/accountService.js` 的 `constructor` 里是 `new Map()` 和 `[]`。`server/database/schema.sql` 写得很完整，但**运行时代码从未 `import` 或 `exec` 过它**；唯一引用它的 `tests/schema.test.js` 只是用正则匹配 SQL 文本，等于在测试"这个文件里有没有这几个字符串"。

这是典型的**假阳性测试**：绿灯让人以为持久化做完了，实际上一次 `Ctrl+C` 就全没了。对含金币的产品是资产事故级风险。

### 3.2 选型理由：SQLite 驱动怎么选

| 备选 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| **`node:sqlite`（Node 22 内置）** | 零依赖、零编译、同步 API（与现有同步代码风格天然契合）、无供应链风险 | 标记为 Experimental，会打 `ExperimentalWarning`；API 可能在 Node 版本间微调 | **采纳** |
| `better-sqlite3` | 成熟稳定、同步 API、生态广 | 原生模块，需 node-gyp/预编译；Windows 开发机 + CI + 可能的 ARM 服务器三端都要有对应二进制，是常见的 CI 崩溃源；新增供应链依赖 | 备选 |
| `sqlite3`（异步） | 老牌 | 回调/异步会**倒逼 AccountService 全部方法改成 async**，进而击穿 `server/index.js` 与 11 个现有测试 | 否决 |
| JSON 文件落盘 | 最简单 | 无事务、无约束、并发写易损坏；金币结算必须原子，JSON 做不到 | 否决 |

**已在本机实测确认可用**（Node v22.22.2）：

```
$ node -e "import('node:sqlite').then(...)"
node:sqlite OK [ [Object: null prototype] { a: 'ok' } ]
(node:5088) ExperimentalWarning: SQLite is an experimental feature...
```

选 `node:sqlite` 的决定性理由是**同步 API**：现有 `AccountService` 全是同步方法，`server/index.js` 直接 `sendJson(response, 200, accounts.getLeaderboard())`，11 个现有测试也全是同步断言。用同步驱动可以做到**换实现不换契约**，改动半径最小，回归风险最低。`better-sqlite3` 同样同步，作为随时可替换的备选：两者 API 高度相似（`prepare/run/all/get/exec`），我会把驱动获取集中在 `server/database/db.js` 一个文件里，将来换驱动只改那一处。

**后果（诚实记录）**：
- 会输出 `ExperimentalWarning`，需在启动脚本或运维文档中说明这是预期行为，不是错误。
- 若未来 Node 升级导致 `node:sqlite` API 变更，需改 `db.js`（单点）。已在下方留下 ADR 式记录。

### 3.3 schema 补充

`schema.sql` 的 `users` 表有 `password_hash` 但**没有 `password_salt`**，而现有实现用 `crypto.scryptSync(password, salt, 64)` + 每用户独立盐。两种解法：

- A. 把盐和哈希拼成 `salt:hash` 存进 `password_hash` —— 不改 schema，但字段语义变浑浊。
- B. **新增 `password_salt TEXT` 列** —— 语义清晰，`tests/schema.test.js` 只断言指定表名和两条正则，加列不会让它变红。

采纳 **B**。同时补一条断言到 schema 测试里，防止以后有人把这列删掉。

`users` 表没有 `games`/`wins` 列，这是**正确的规范化设计**：战绩应从 `match_players` 聚合得出（`COUNT(*)` 与 `SUM(is_winner)`），避免冗余字段与明细对不上。因此 `getProfile().stats` 改为 SQL 聚合查询，行为与现有测试期望一致。

`matches` 表没有 `sequence` 列，现有内存实现用 `nextMatchSequence` 排序。SQL 侧改用 `ORDER BY finished_at DESC, rowid DESC` —— `rowid` 是 SQLite 内置单调递增列，能正确处理"同一毫秒内保存两局"的边界。

### 3.4 改动点

| 文件 | 改动 |
| --- | --- |
| `server/database/schema.sql` | `users` 表新增 `password_salt TEXT` 列 |
| `server/database/db.js`（**新建**） | `openDatabase(location)`：加载 `node:sqlite`、建库/建表、`PRAGMA foreign_keys=ON`、文件库开 `journal_mode=WAL`（提升并发读写稳健性）；**唯一的驱动接触点** |
| `server/accountService.js` | 全量改写为 SQL 实现。**公开方法签名、返回结构、错误文案逐字保持不变**。新增可选构造参数 `{ databaseFile }`（默认 `server/database/mahjong.db`，`:memory:` 供测试）与 `close()` |
| `server/index.js` | `new AccountService({ databaseFile: process.env.MAHJONG_DB_FILE ?? 默认路径 })`；启动日志打印实际库文件位置 |
| `tests/schema.test.js` | 补 `password_salt` 断言 |
| `tests/accountService.test.js` | 改一处：原测试第 113-114 行直接改私有内存 `accounts.users.get(beta.id).stats.wins = 2`，SQL 化后该字段不存在。改为用公开 API `saveMatch()` 造出真实胜场——**这是把测试变强，不是迁就实现** |
| `.gitignore` | 忽略 `server/database/*.db*` |

### 3.5 原子性

`recordRoundCoinChanges` 是金币安全的核心。SQL 版本用 `BEGIN IMMEDIATE / COMMIT / ROLLBACK` 包住，任一玩家余额不足则整笔回滚。数据库层另有 `CHECK (coins >= 0)` 和 `CHECK (balance_after >= 0)` 兜底——**应用层校验 + 数据库约束双保险**，即便将来有人绕过 service 直接写库也扣不成负数。

### 3.6 自测方法

- **自动化（最关键的一条）**：`tests/accountPersistence.test.js` —— 用临时 `.db` 文件建 service、注册用户、结算金币、存战绩、`close()`、**再用同一文件新建一个 service 实例**，断言用户/金币/流水/战绩/排行榜全部还在。**这条测试直接对准 BUG-003 的失败模式：进程重启后资产是否还在。**
- **自动化**：原有 11 项 `accountService.test.js` 必须在 SQL 实现下继续全绿（契约不变的证明）。
- **手动**：`npm run server` → 注册账号 → `Ctrl+C` → 重启 → 用同一账号密码登录成功、金币不变。

---

---

## 4. P1-5【Blocker】WebSocket 协议层只能传 <126 字节，真实牌局状态一广播就崩

> 来源：release-lead 发布清单 P1-5；主理人已亲读 `server/webSocketServer.js` 核实。
> 这是原风险表 R-5 的正式排期落实（联网是国内发布范围的必含项，修好 BUG-001 之后必然立刻暴露）。

### 4.1 根因

`server/webSocketServer.js` 的实时协议实现只写了"玩具版"：

- `encodeWebSocketText`（第 10-14 行）：`if (payload.length >= 126) throw new Error('实时消息过长…')`。**四人麻将房间状态 JSON 必然远超 125 字节**，于是服务端一 `broadcast` 房间状态就抛错。
- `socket.on('data')`（第 36-47 行）：假设**一个 `data` 事件 = 一帧短消息**：
  - 只读了 `buffer[1] & 0x7f` 作为长度，完全没处理 **126（16 位）/ 127（64 位）扩展长度**；
  - 没处理**客户端→服务器帧必带的掩码**（浏览器发来的文本帧必须带掩码）；
  - 没做**分片重组**（FIN=0 续帧），也没处理 **ping / pong / close** 控制帧。
  - 还假设 TCP 不会把一帧拆成多个 `data`、也不会把多帧合并到一个 `data` —— 这两个假设在真实网络下都不成立。

后果链：即便 BUG-001（客户端地址）修好了，真机连上服务器 → 房主点"开始游戏" → 服务端 `broadcast(room:started)` 带 `gameState` → 超过 125 字节 → `encodeWebSocketText` 直接 throw → 所有客户端收不到状态、牌局卡死。联网依旧不可用。

### 4.2 选型理由：为什么直接重写编解码而不是"调大阈值"

| 备选方案 | 评价 | 结论 |
| --- | --- | --- |
| A. 把 125 阈值调大（如 64KB） | 没解决根因：掩码、分片、控制帧、TCP 分片都没处理；且帧格式仍非标准，任意稍大的包就可能错位 | 否决 |
| B. **按 RFC 6455 实现完整帧编解码** | 一次性把扩展长度、掩码、分片重组、ping/pong/close、跨 TCP 分片缓冲全部做对；与浏览器原生 WebSocket 完全兼容 | **采纳** |
| C. 引入 `ws` 库 | 成熟，但要新增依赖 + 改造 `server/index.js`/`createServer.js` 的接入方式，改动半径大 | 本次否决（如后续要更强特性再评估） |

采纳 B。**关键约束：`broadcast(message, shouldSend=()=>true)` 的对外语义完全不变**，`createServer.js` 里 7 处 `socket.write(encodeWebSocketText(...))` 和 `realtime.broadcast(...)` 调用**一行都不用改**——编码只在内部变正确。

客户端（浏览器 / Capacitor WebView）用的是原生 `WebSocket`，本身就会：发出带掩码的帧、自动解码扩展长度与分片帧、页面关闭时发 close 帧、对服务端 ping 自动回 pong。所以**本次只改服务端**，前端零改动即可获得正确的收发能力。

### 4.3 改动点

| 文件 | 改动 |
| --- | --- |
| `server/webSocketServer.js`（**重写**） | ① `encodeWebSocketText` 不再抛错，按长度自动选 1/2/8 字节长度头（服务端帧不加掩码）；② 新增内部 `parseFrame()`：处理 126/127 扩展长度、客户端掩码解算、跨 `data` 事件缓冲；③ `socket.on('data')` 改为"缓冲累加 + 循环解析完整帧"；④ 新增 `handleFrame()`：正确处理 ping→pong、close→回 close 并 `end()`、pong 忽略、文本/续帧分片重组（非法续帧回 1002 并关连接）；⑤ `broadcast` 签名与语义不变 |
| `tests/webSocketServer.test.js`（**扩展**） | 保留原 2 条；新增：16 位长度头（≥126 字节不抛错且可还原）、64 位长度头（≥65536 字节）、用假 socket 喂**掩码帧**验证解码、分片续帧重组、ping→pong、close→关连接、跨 TCP 分片缓冲 |
| `tests/webSocketProtocol.test.js`（**新建**） | **端到端真枪实弹**：用 Node 内置全局 `WebSocket` 客户端连真实 `createAppServer`，断言「**>125 字节房间状态广播完整送达并被客户端解码**」这一核心回归用例，外加 >65535 字节（64 位长度头）广播、客户端 close 服务端正确回 close 且不崩 |

`createServer.js`、`src/app/main.js`、`index.html` 均**不改动**：服务端只换了更正确的帧编码，前端用的是原生 WebSocket，无需任何适配。

### 4.4 自测方法

- **自动化（核心回归）**：`tests/webSocketProtocol.test.js` 的 `a >125-byte room-state broadcast is delivered intact to a real client` —— 这是团队要求的">125 字节状态广播成功用例"，用真实 `WebSocket` 客户端证明大 payload 能端到端跑通。
- **自动化（协议细节）**：`tests/webSocketServer.test.js` 覆盖扩展长度、掩码、分片、ping/pong/close、TCP 分片缓冲。
- **手动（Web）**：`npm run server` + `npm run dev` → 两人各开一房、一人点"开始游戏" → 另一端应看到完整牌局状态；断网再连应触发重连而非白屏。
- **手动（包内真机）**：修复 BUG-001 后真机联机 → 开始游戏不再卡"创建房间"/白屏。

### 4.5 已知不在本次范围（上报主理人）

- 客户端 `src/app/main.js` 的 WebSocket **无 `close` / 掉线重连监听**（QA 门控 RISK-1，N-6 体验问题）。本次服务端已能正确处理 close 帧，但前端"掉线不自知、需手动点恢复房间"的体验债仍建议单独排期。它不阻塞"联网可用"，故 P1-5 未含。
- 服务端**主动心跳（server→client ping）**未启用；浏览器会响应，但服务端不主动探活。可作为后续健壮性增强。

---

## 5. 实施顺序

按依赖关系串行，每步独立可验证（符合 AGENTS.md 串行执行、避免同时高负载）：

1. **BUG-003 服务端持久化** → 跑 `node --test tests/*.test.js`（无前端依赖，先把地基做实）
2. **P1-5 WebSocket 协议层重做** → 跑 `node --test tests/webSocketServer.test.js tests/webSocketProtocol.test.js`（含 >125 字节广播用例，先于前端联调）
3. **BUG-001 配置入口** → 跑测试 + `vite build`
4. **BUG-002 前端账号接入** → 跑测试 + `vite build`
5. 全量回归：`node --test tests/*.test.js` + `node .\node_modules\vite\bin\vite.js build`

## 6. 验证命令（AGENTS.md 要求）

```bash
node --test tests/*.test.js              # 必须通配写法，目录写法在 Node 22 会 MODULE_NOT_FOUND
node .\node_modules\vite\bin\vite.js build
```

基线：改动前 **108 项全过**。规则引擎 `src/mahjongCore.js` 本次不改，108 项必须仍全过。

## 7. 如何堵住"测试通过但功能未接通"

这是本次修复真正要解决的元问题。三道防线：

| 防线 | 手段 | 对应本次新增 |
| --- | --- | --- |
| 1. 不允许"文本正则"冒充功能测试 | schema 类测试必须**真正建库执行** SQL，而不是正则匹配文件内容 | `accountPersistence.test.js` 实际 `exec(schema)` 建表 |
| 2. 集成层必须有测试 | 起真实 HTTP server + 真实 fetch 跑通接口契约 | `apiContract.test.js` |
| 3. 失败要响 | 配置缺失时**抛出明确错误**，而不是静默回落到错误默认值 | `src/config.js` 包内无配置即报错 |

## 8. 已知遗留与风险（上报主理人）

| 编号 | 事项 | 严重度 | 说明 |
| --- | --- | --- | --- |
| R-1 | 账号接口无鉴权 | **高** | 知道 userId 即可读他人资料、以其名义存战绩。公网发布前必须补 token。本次不改（会破坏契约不变约束），建议单独排期 |
| R-2 | 生产 TLS 未落地 | 高 | 需运维提供反代 + 证书，App 侧注入 `wss://` 地址即可 |
| R-3 | `node:sqlite` 为实验特性 | 中 | 有 `ExperimentalWarning`；已把驱动收敛到 `db.js` 单点，换 `better-sqlite3` 成本低 |
| R-4 | `GET /api/users/...` 不支持 query string | 低 | 服务端字符串切分解析所致；前端已规避 |
| R-5 | WS 帧长度上限 125 字节 | **已修复** | 已由 P1-5 落实：`webSocketServer.js` 重写为完整 RFC 6455 帧编解码（扩展长度 126/127、掩码、分片重组、ping/pong/close）。`tests/webSocketProtocol.test.js` 用真实 `WebSocket` 客户端验证 >125 字节房间状态广播完整送达 |
| R-6 | 房间数据仍在内存 | 中 | 本次只持久化账号；服务重启后房间丢失（可接受，玩家可重建房） |

> R-5 已通过 P1-5 关闭：BUG-001 修好后真机能连上服务器，"开始游戏"不再因 `gameState` 超 125 字节抛错（服务端帧编码已支持任意大小）。
