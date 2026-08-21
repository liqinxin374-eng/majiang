# 发财麻将 · 发布前最终 QA 门控清单

| 项目 | 内容 |
|---|---|
| 文档编号 | QA-7-FINAL-01 |
| 阶段 | Phase 7 发布前最终质量门 |
| 负责人 | 严守真（QA 负责人 / quality-lead） |
| 评审强度 | 标准 full |
| 建档日期 | 2026-08-07 |
| 本轮门控结论 | **FAIL（不予放行）** —— 详见第六节 |

> 本文档是**建议性门控（advisory gate）**。QA 给出判定与依据，最终是否放行由用户（大哥）决定。

---

## 一、三级判定标准

判定针对"整体发布"，不是单项。取所有检查项中**最差**的一级作为总判定。

### PASS（放行）

同时满足：

1. 全部 P0 必测项证据齐全且结果为通过。
2. 无 Blocker、无 Critical 级未修复缺陷。
3. Major 级缺陷 ≤ 2 项，且每项都有用户书面接受的规避方案。
4. 自动化测试 108/108 通过，生产构建通过，性能检查通过。
5. Android + iOS 真机各完成至少 1 局完整对局，无闪退、无白屏。
6. 四台真机联网完成至少 1 局完整对局，含 1 次断线重连成功。
7. 数小时内存压测无崩溃、无持续单调增长的内存曲线。

### CONCERNS（有条件放行）

满足以下任一，且不触发 FAIL 条件：

1. P0 必测项全部通过，但存在 3 项以上 Major 缺陷。
2. 存在 Minor 缺陷若干，不影响核心对局闭环。
3. 某项证据形式不完整（例如有截图无录屏），但结论可由其他证据交叉验证。
4. 性能指标未超硬上限，但较上一版本出现明显劣化（>20%）。

处理方式：列出遗留问题清单 + 明确修复窗口，由用户签字后放行。

### FAIL（不予放行）

触发以下任一即判 FAIL：

1. 存在 Blocker 级缺陷（核心功能在目标环境下不可用）。
2. 任一 P0 必测项**无法执行**或**执行失败**。
3. 自动化测试有失败项，或生产构建失败。
4. 真机出现闪退、白屏、卡死、数据丢失。
5. 用真机以外的环境（模拟器/浏览器仿真）冒充真机验收证据。
6. 声称"已实现"的功能，在端到端链路上实际不可达。

---

## 二、缺陷严重度定义

| 级别 | 定义 | 处置 |
|---|---|---|
| Blocker | 核心对局或核心链路在目标环境完全不可用；无规避手段 | 必须修复后重测，阻塞发布 |
| Critical | 主要功能失效或数据丢失，但有临时规避手段 | 必须修复后重测 |
| Major | 功能可用但明显偏离预期，影响体验或数据准确性 | 发布前修复，或用户书面接受 |
| Minor | 视觉、文案、边缘场景瑕疵，不影响功能 | 可进入下一迭代 |

---

## 三、P0 必测项与证据要求

证据统一存放 `test-evidence/`，命名规则：`用途-日期.扩展名`，例如 `android-real-device-fullround-2026-08-07.png`。

> **硬规则（AGENTS.md）**：严禁用模拟器代替真机验收。模拟器截图一律不接受为真机证据。所有真机证据必须能看出是物理设备（系统状态栏、设备型号、非模拟器边框）。

### 3.1 Android 真机（P0）

| 编号 | 检查项 | 通过标准 | 必需证据 |
|---|---|---|---|
| A-1 | 安装 | APK 成功安装，无签名/兼容性报错 | `adb install` 输出日志 `android-install-log-<日期>.txt` |
| A-2 | 首次启动 | 启动页正常显示后进入首页，无白屏、无闪退，冷启动 < 5 秒 | 截图 `android-first-launch-<日期>.png` + 计时说明 |
| A-3 | 横屏 | 强制/提示横屏生效，牌桌、手牌、操作按钮无遮挡无裁剪 | 截图 `android-landscape-<日期>.png` |
| A-4 | 刘海屏安全区 | 关键元素不被挖孔/圆角/手势条遮挡 | 截图 `android-safearea-<日期>.png` |
| A-5 | 触屏操作 | 点击手牌、碰/杠/胡/过按钮响应准确，无误触，热区足够 | 录屏 `android-touch-<日期>.mp4` |
| A-6 | 完整一局对局 | 从定缺到结算完整走完，含至少 1 次碰或杠、1 次胡牌 | 录屏 `android-fullround-<日期>.mp4` + 结算截图 |
| A-7 | 后台恢复 | 切后台再回前台，牌局状态保持，不白屏不重置 | 录屏或前后对比截图 |
| A-8 | 崩溃日志 | 全程 `adb logcat` 无 FATAL EXCEPTION、无 ANR | 日志 `android-logcat-<日期>.txt` |

### 3.2 iOS 真机（P0）

| 编号 | 检查项 | 通过标准 | 必需证据 |
|---|---|---|---|
| I-1 | Mac + Xcode 签名 | Signing & Capabilities 选定团队，构建成功 | Xcode 构建成功截图 `ios-signing-<日期>.png` |
| I-2 | 安装 | 安装到 iPhone/iPad 成功，设备已信任开发者 | 截图 `ios-install-<日期>.png` |
| I-3 | 首次启动 | 启动页正常，进入首页无白屏无闪退 | 截图 `ios-first-launch-<日期>.png` |
| I-4 | 横屏 | 横屏布局完整，安全区正确 | 截图 `ios-landscape-<日期>.png` |
| I-5 | 触屏操作 | 手牌与操作按钮响应准确 | 录屏 `ios-touch-<日期>.mp4` |
| I-6 | 完整一局对局 | 定缺到结算完整走完 | 录屏 `ios-fullround-<日期>.mp4` |
| I-7 | 二次启动 | 退出 App 再打开，不白屏不闪退 | 录屏或截图 |
| I-8 | 崩溃日志 | Xcode Console 无崩溃堆栈 | 日志 `ios-console-<日期>.txt` |

### 3.3 四台真实设备同时联网（P0）

> **当前状态：本组全部项目预期失败。** 依据见第六节 BUG-001，打包 App 内 WebSocket 地址解析为 `wss://localhost:3001/ws`，指向手机自身，不可能连上局域网服务器。**建议先修复 BUG-001 再安排本组测试，否则四台设备与人力全部空跑。**

| 编号 | 检查项 | 通过标准 | 必需证据 |
|---|---|---|---|
| N-1 | 创建房间 | 设备 1 创建成功并显示房间号 | 截图 `net-create-room-<日期>.png` |
| N-2 | 加入房间 | 设备 2/3/4 均成功加入，四人就位 | 四机同框照片 `net-4devices-joined-<日期>.jpg` |
| N-3 | 准备与开始 | 全员准备后房主开始，四端同时进入牌局 | 四机同框照片或录屏 |
| N-4 | 实时出牌同步 | 任一设备出牌，其余三端 1 秒内同步显示 | 录屏 `net-sync-<日期>.mp4`（需拍到四屏） |
| N-5 | 碰杠胡同步 | 服务端权威校验生效，四端状态一致 | 录屏 |
| N-6 | 断线重连 | 断网 30 秒后恢复，能回到原牌局且状态正确 | 录屏 `net-reconnect-<日期>.mp4` |
| N-7 | 非法操作拦截 | 不到自己回合出牌被服务端拒绝 | 截图 + 服务端日志 |
| N-8 | 完整一局 | 四人从定缺打到结算，分数一致 | 录屏 + 四端结算截图 |

### 3.4 数小时持续运行内存压力测试（P0）

| 编号 | 检查项 | 通过标准 | 必需证据 |
|---|---|---|---|
| M-1 | 持续时长 | 连续运行 ≥ 4 小时不中断 | 起止时间戳截图 |
| M-2 | 无崩溃 | 全程无闪退、无 ANR、无强杀 | `android-logcat-longrun-<日期>.txt` |
| M-3 | 无内存泄漏 | 内存曲线在多局后回落，不呈单调上升；4 小时增幅 < 20% | 内存采样曲线 `memory-curve-<日期>.png` + 原始数据 CSV |
| M-4 | 无卡死 | 界面持续响应，帧率不持续低于 30 FPS | 录屏片段（首/中/末各一段） |
| M-5 | 定时器不累积 | 长跑后定时器与监听器数量稳定 | DevTools 性能面板截图 |

**重点观察对象**（代码审计已定位的风险点，见第五节 RISK 列表）：

- `src/app/main.js:1668` 永不清除的 1 秒 `setInterval`
- `src/app/main.js:429` `USER_REACTION_TIMER`、`:311` `BACKGROUND_MUSIC_TIMER`
- `setTimeout` 16 处对 `clearTimeout` 仅 2 处
- `addEventListener` 45 处对 `removeEventListener` 0 处
- 每次出牌重建手牌 DOM 并重新绑定监听（`src/app/main.js:586`）

### 3.5 规则关键点回归（P0）

自动化已覆盖，**发布前必须重跑一次并留存输出**。

| 编号 | 规则点 | 通过标准 | 证据 |
|---|---|---|---|
| R-1 | 定缺后优先打缺门牌 | 有缺门牌时不能打其他花色 | 测试输出 + 真机录屏 |
| R-2 | 操作优先级 胡 > 杠 > 碰 > 过 | 多人可响应时高优先级胜出 | 测试输出 |
| R-3 | 最后四张有胡必胡 | 不能用"过"跳过 | 测试输出 |
| R-4 | 血战到底 | 胡牌者退出本局，其余继续；牌墙摸完或仅剩一名未胡时结束 | 测试输出 |
| R-5 | 100 盘机器人对局稳定 | 不卡死、不丢牌、不重复牌、已胡玩家不再行动 | 测试输出 `mahjong-100round-<日期>.txt` |

**R-5 覆盖度评审：ADEQUATE。** `tests/mahjongSimulation.test.js` 断言质量良好，逐步校验 108 张牌守恒（`countPhysicalTiles`）、ID 唯一性、指纹重复检测卡死（`repeatedFingerprintCount < 2`）、已胡玩家不得行动、600 步上限。

**本轮已执行结果（2026-08-07，QA 实跑）：**

```
node --test tests/mahjongCore.test.js   → 72/72 通过，0 失败
node --test tests/*.test.js             → 108/108 通过，0 失败（耗时 9.77s）
node scripts/checkPerformance.js        → 通过：JS 22603B / CSS 15278B / 主题图片 1790433B
```

> 注意：`node --test tests/` （目录写法）在 Node v22 下会 MODULE_NOT_FOUND 报错，**必须使用 `tests/*.test.js` 通配写法**。这是命令用法问题，不是产品缺陷，但请写进后续文档避免误判为测试失败。

### 3.6 构建与产物（P0）

| 编号 | 检查项 | 通过标准 | 证据 |
|---|---|---|---|
| B-1 | 生产构建 | `node ./node_modules/vite/bin/vite.js build` 成功 | 构建输出日志 |
| B-2 | 性能门 | `node scripts/checkPerformance.js` 通过 | 命令输出 |
| B-3 | APK 产物 | 存在且为本次构建 | 文件路径 + 大小 + 时间戳 |
| B-4 | 浏览器控制台 | 0 错误 0 警告 | 控制台截图 |

---

## 四、P1 建议测试项（不阻塞，但影响质量评级）

| 编号 | 检查项 | 说明 |
|---|---|---|
| S-1 | 弱网测试 | 200ms / 500ms 延迟、5% 丢包下出牌同步是否可接受 |
| S-2 | 低端机型 | 至少 1 台 3 年前中低端 Android，验证帧率与内存 |
| S-3 | 小屏适配 | 854×480 等小分辨率横屏无溢出（浏览器侧已有记录，真机需复核） |
| S-4 | 音量与静音 | 系统静音、耳机插拔、来电打断后音频行为正常 |
| S-5 | 主题切换 | 三套主题（科幻/国风/仙侠）在真机切换无闪烁、无资源丢失 |
| S-6 | 长时间挂机 | 挂机不操作 30 分钟，倒计时与托管逻辑正常 |

---

## 五、本轮代码审计发现的风险点（RISK）

| 编号 | 风险 | 位置 | 影响 |
|---|---|---|---|
| RISK-1 | WebSocket 无 `close` 事件监听，掉线不自知 | `src/app/main.js:1543-1555, 1585-1598, 1646-1653` | 断线后需用户手动点"恢复房间"，N-6 体验差 |
| RISK-2 | 监听器只增不减 | 45 处 `addEventListener` / 0 处 `removeEventListener` | 长跑内存增长，M-3/M-5 重点 |
| RISK-3 | 定时器清理不对称 | `setTimeout` 16 / `clearTimeout` 2 | 长跑定时器累积 |
| RISK-4 | 永久 1 秒定时器 | `src/app/main.js:1668` | 后台常驻，耗电与唤醒 |
| RISK-5 | 性能门存在覆盖盲区 | `scripts/checkPerformance.js:39` | 仅统计 `theme_*.png`，漏掉约 4.4MB 图片 |

> 补充：Socket 侧已正确处理，`ROOM_SOCKET?.close()` 在 1540 / 1582 / 1625 / 1644 均有调用，**无 socket 句柄泄漏**，此项无需担心。

---

## 六、本轮门控判定：FAIL

### 判定依据

触发 FAIL 条件第 1、2、6 条。以下三项为发布阻塞缺陷。

---

### BUG-001【Blocker】打包 App 内联网对战必定无法连接服务器

**严重度**：Blocker
**优先级**：P0，阻塞发布
**影响范围**：Android / iOS 打包 App 的全部联网功能

**环境**
- 产物：`android/app/build/outputs/apk/debug/app-debug.apk`（19,195,265 字节，2026-07-31 13:48）
- Capacitor 8.4.2，`capacitor.config.json` 未配置 `server` 段

**根因分析**
1. `capacitor.config.json` 与 `android/app/src/main/assets/capacitor.config.json` 均无 `server.androidScheme` 配置，Capacitor 6+ 默认 `androidScheme: "https"`，故 WebView 的 origin 为 `https://localhost`。
2. `src/app/main.js:1538-1541`（创建房间）、`:1580-1583`（加入房间）、`:1642-1645`（重连）三处均使用：
   ```js
   const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
   const host = window.location.hostname || 'localhost';
   ROOM_SOCKET = new WebSocket(`${protocol}://${host}:3001/ws`);
   ```
3. 在 App 内代入得到 `wss://localhost:3001/ws` —— 指向**手机自己**，且要求 TLS。
4. 服务端 `server/index.js:104` 为纯明文 `server.listen(3001)`，无 TLS。

**复现步骤**
1. 局域网内 PC 启动 `npm run server`（监听 3001）。
2. 安装 `app-debug.apk` 到 Android 真机，与 PC 同一 Wi-Fi。
3. 打开 App → 点击"创建房间"。

**预期结果**：连接到局域网服务器，返回房间号。
**实际结果**：连接失败，状态栏显示"房间服务器未启动"。四台设备联网测试（N-1 至 N-8）全部无法开始。

**修复建议**（需程基岩实施，QA 不改业务代码）
- 增加可配置服务器地址：构建期环境变量或设置面板内手工填写局域网 IP。
- `capacitor.config.json` 增加 `server.cleartext: true` 与 `server.androidScheme: "http"`，或服务端启用 wss。
- Android 需补 `usesCleartextTraffic` 或 `network_security_config.xml`（当前两者均无；`INTERNET` 权限已有，见 `AndroidManifest.xml:41`）。

**回归要求**：修复后必须重跑 N-1 至 N-8 全组。

---

### BUG-002【Blocker】账号 / 金币 / 战绩 / 排行榜前端零接入

**严重度**：Blocker（对"已实现"的声明而言）
**优先级**：P0

**证据**
- 在 `src/app/main.js` 与 `index.html` 中检索 `account|login|register|金币|战绩|排行榜|coins|leaderboard`，**命中数均为 0**。
- `src/app/main.js` 中 `fetch(` 命中 0 处，`XMLHttpRequest` 命中 0 处。
- 服务端接口齐全且有单元测试覆盖：`/api/auth/register`、`/api/auth/login`、`/api/auth/guest`、`/api/matches`、`/api/leaderboard`、`/api/users/`（`server/index.js:24-46`）。

**结论**：第八阶段（账号、金币、战绩）在**服务端 + 单元测试层面已实现**，但**前端完全没有接入**，端到端链路不存在。玩家在 App 里无法注册、登录、查看金币或战绩。`开发计划清单.md` 第九节将 11 项全部标记 `[x]` 与实际不符。

**建议**：要么补前端接入并重测，要么明确本次发布不含账号系统，同步修正开发计划清单标记与对外说明。

---

### BUG-003【Critical】账号数据纯内存存储，服务重启即全部丢失

**严重度**：Critical
**优先级**：P0

**证据**
- `server/accountService.js:9-15`：`this.users = new Map()`、`this.transactions = []`、`this.matches = []`。
- 全 `server/` 目录检索 `sqlite|mysql|writeFile|readFile|fs.`，**命中 0**，无任何持久化。
- 代码注释自认：*"账号服务目前使用内存仓库…后续接入 SQLite 时，只需要把 Map 的读写替换为 schema.sql 对应的表操作。"*
- `server/database/schema.sql` 存在且被 `tests/schema.test.js` 校验，但**从未被任何运行时代码引用**——测试只验证了 SQL 文本内容，属于"测试通过但功能未接通"的典型假阳性。

**影响**：含金币系统的产品若上线后服务重启，全部用户资产归零。

**建议**：接入 SQLite 落地 `schema.sql`，或本次发布明确关闭账号与金币功能。

---

### 其余缺陷（不单独阻塞，计入质量评级）

| 编号 | 严重度 | 问题 | 证据 |
|---|---|---|---|
| BUG-004 | Major | 性能门覆盖盲区：`scripts/checkPerformance.js:39` 正则 `/theme_.*\.png$/i` 仅统计 179 万字节主题图，漏统计 4 个头像 PNG（850KB–994KB，共约 3.55MB）与 `themes/xianxia_cloud_bg.jpg`（856KB）。dist 实际总量 6.55MB，图片实际 6.07MB。 | 实测 |
| BUG-005 | Major | 头像 PNG 未做任何压缩，单张接近 1MB 用作头像，明显未优化 | `dist/avatar_*.png` |
| BUG-006 | Minor | 文档性能数值过期：`上线前验收报告.md` 记 JS 20KB / CSS 12KB，实测 22.6KB / 15.3KB（CSS 较之增长约 27%）；APK 记 18,291,095 字节，实际 19,195,265 字节 | 实测 |
| BUG-007 | Major | 无自动断线检测：三处 socket 均只监听 `open`/`message`/`error`，未监听 `close`，掉线后必须用户手动点击"恢复房间" | `src/app/main.js:1543-1555, 1585-1598, 1646-1653` |
| BUG-008 | Minor | 重连测试覆盖薄弱：仅 `tests/roomService.test.js:153,158` 两条服务端断言，无客户端重连测试 | 评审判定 INCOMPLETE |

---

## 七、签字放行所需最小证据集

以下为**放行的最低门槛**，缺一不可。

### 前置（必须先完成，否则后续测试空跑）

- [ ] BUG-001 已修复并提供修复说明
- [ ] BUG-002 已修复，或用户书面确认"本次发布不含账号系统"
- [ ] BUG-003 已修复，或用户书面确认"本次发布不含金币系统"

### 自动化层（每次发布重跑）

- [ ] `node --test tests/mahjongCore.test.js` → 72/72，输出留存
- [ ] `node --test tests/*.test.js` → 108/108，输出留存
- [ ] `node ./node_modules/vite/bin/vite.js build` → 成功
- [ ] `node scripts/checkPerformance.js` → 通过

### 真机层（人工，不可替代）

- [ ] Android：`android-fullround-<日期>.mp4`（完整一局）
- [ ] Android：`android-logcat-<日期>.txt`（无 FATAL / ANR）
- [ ] iOS：`ios-fullround-<日期>.mp4`（完整一局）
- [ ] iOS：`ios-console-<日期>.txt`（无崩溃堆栈）
- [ ] 联网：`net-4devices-joined-<日期>.jpg`（四机同框）
- [ ] 联网：`net-sync-<日期>.mp4`（实时同步，需拍到四屏）
- [ ] 联网：`net-reconnect-<日期>.mp4`（断线重连成功）
- [ ] 压测：`memory-curve-<日期>.png` + 原始 CSV（≥4 小时）
- [ ] 压测：`android-logcat-longrun-<日期>.txt`（无崩溃）

### 文档层

- [ ] `测试清单.md` 中四项 `[ ]` 全部转 `[x]` 并附证据路径
- [ ] `上线前验收报告.md` 性能与 APK 数值更新为实测值
- [ ] 本清单签字页填写完毕

---

## 八、签字页

| 角色 | 姓名 | 判定 | 日期 | 备注 |
|---|---|---|---|---|
| QA 负责人 | 严守真 | **FAIL** | 2026-08-07 | 3 项阻塞缺陷，详见第六节 |
| 主理人 | 游承峰 | 待填 | | |
| 最终放行 | 大哥（用户） | 待填 | | 门控为建议性，最终由用户决定 |

---

## 九、QA 结论

自动化质量**扎实**：108 项测试全通过为我方实跑复核，100 盘机器人对局的断言设计（牌数守恒、ID 唯一、卡死指纹检测、已胡玩家保护）质量高于一般项目水平，规则引擎可信度好。

但**"功能全做完"这一判断不成立**。真正的差距不在真机验收，而在于三条链路在端到端层面根本没有接通：联网对战在打包 App 里连不上服务器、账号金币战绩前端零接入、账号数据不落盘。这三项都是通过读代码而非跑测试才能发现的问题——它们恰好都躲开了现有测试的覆盖范围（服务端单测全过、前端没有对应测试）。

因此**当前不具备真机验收的前置条件**。若现在就让大哥组织四台真机测试，N 组八项会在第一步全部失败，四台设备和人力全部空跑。

**建议路径**：先修 BUG-001（或至少让服务器地址可配置），再安排真机验收；BUG-002 / BUG-003 由用户决策是"补实现"还是"本次发布不含该功能"，两种选择都可接受，但不能维持"标记为已完成但实际不通"的现状。
