# F50 Widget 五标签重构 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `F50 Widget` 从「状态/短信/设置」三标签重构为「状态/短信/电话/插件/设置」五标签，并建立统一设计系统与可替换能力适配层。

**Architecture:** 纯逻辑模块（`call.ts` / `plugins.ts`）不依赖 Scripting 运行时，可直接单测；网络层集中在 `api.ts`；UI 层保持扁平文件（`*_view.tsx` + `ui.tsx`），由 `index.tsx` 组装五标签。

**Tech Stack:** TypeScript / TSX（Scripting App 运行时）、Node 原生测试 + 自定义 loader、SF Symbols、Scripting Charts。

**Spec:** `docs/superpowers/specs/2026-10-16-f50-widget-refactor-design.md`

## Global Constraints

- 不新增第三方 npm 依赖；测试只用 `node:assert/strict`。
- `Storage` / `Keychain` / `FileManager` 是全局 API，**禁止**从 `"scripting"` 导入。
- 所有新文件放 `F50 Widget/` 根目录（子目录导入未验证）。
- 设备不支持的能力一律显示「暂不支持」，禁止编造数值。
- 拨号、重启等破坏性/外部副作用操作必须二次确认。
- 中文文案，SF Symbols 图标，语义色优先（`secondaryLabel` 等）。
- 提交信息遵循 Conventional Commits。

## Review Focus

- 2333 不可达时每个页面是否仍可用（缓存 + 明确错误态）。
- `AT+CLCC` 在无通话、单通话、多方通话下的解析是否都不崩溃。
- 插件文本被手工编辑破坏（缺 END 标记、重名、空内容）时的解析行为。
- 拨号号码含 `+` / `#` / `*` 时 AT 命令构造是否安全。
- 五标签切换时是否重复触发网络请求（沿用同步锁模式）。

---

### Task 1: `call.ts` 通话协议纯函数

**Files:**
- Create: `F50 Widget/call.ts`
- Test: `F50 Widget/tests/call.test.ts`

**Interfaces:**
- Produces:
  - `type CallDirection = "mo" | "mt" | "unknown"`
  - `type CallStatus = "idle" | "dialing" | "alerting" | "active" | "held" | "incoming" | "unknown"`
  - `interface CallInfo { index: number; direction: CallDirection; status: CallStatus; number: string; raw: string }`
  - `buildDialCommand(number: string): string | null` — 号码仅保留 `0-9+*#`，空则 null；返回 `ATD<num>;`
  - `buildAnswerCommand(): "ATA"`、`buildHangupCommand(): "ATH"`、`buildStatusCommand(): "AT+CLCC"`
  - `parseClcc(raw: string): CallInfo[]` — 解析全部 `+CLCC:` 行
  - `summarizeCall(calls: CallInfo[]): CallStatus` — 单通话取状态；多通话优先 active
  - `parseAtsSuccess(raw: string): boolean` — 含 `OK`/`CONNECT` 且无 `ERROR`；`ATH` 场景 `NO CARRIER` 也算成功

- [ ] Step 1: 写失败测试（覆盖：号码清洗、CLCC 单/多/空、状态优先级、NO CARRIER 判成功）
- [ ] Step 2: 运行 `node --import "./F50 Widget/tests/register.mjs" "./F50 Widget/tests/call.test.ts"` → FAIL（模块不存在）
- [ ] Step 3: 实现 `call.ts`
- [ ] Step 4: 运行 → PASS
- [ ] Step 5: 提交

### Task 2: `plugins.ts` UFI-TOOLS 插件片段解析

**Files:**
- Create: `F50 Widget/plugins.ts`
- Test: `F50 Widget/tests/plugins.test.ts`

**Interfaces:**
- Produces:
  - `interface PluginEntry { name: string; content: string; enabled: boolean }`
  - `parsePlugins(text: string): PluginEntry[]`
  - `serializePlugins(list: PluginEntry[]): string`
  - `setPluginEnabled(text: string, name: string, enabled: boolean): string`
  - `removePlugin(text: string, name: string): string`
- 规则：`<!-- [KANO_PLUGIN_START] name -->` … `<!-- [KANO_PLUGIN_END] name -->`；禁用态内容被 `<!-- [kano_disabled]` … `[kano_disabled] -->` 包裹；无法闭合的片段保留原始文本不丢失。

- [ ] Step 1–5: 同 Task 1 的 TDD 循环（测试命令换成 `plugins.test.ts`）

### Task 3: `api.ts` 扩展（AT / VoLTE / 插件 / SIM / Wi-Fi 客户端）

**Files:**
- Modify: `F50 Widget/api.ts`
- Test: `F50 Widget/tests/regression.test.ts`（追加用例）

**Interfaces:**
- Produces:
  - `fetchAT(command: string, slot?: number): Promise<string>`
  - `fetchVolteState(slot?: number): Promise<boolean | null>`（`null` = 接口不可用）
  - `setVolteState(enabled: boolean, slot?: number): Promise<boolean>`
  - `fetchPluginsText(): Promise<string>`
  - `savePluginsText(text: string): Promise<boolean>`
  - `getBasicFields()` 增加 `iccid` / `msisdn` / `sim_msisdn` / `imsi` / `imei` / `pin_status` / `sim_pin_status` / `network_provider`（已有部分）
- Consumes: 现有 `requestJSON`、`buildKanoHeaders*`、`readJSONResponse`

- [ ] Step 1: 写失败测试（mock fetch 返回 `{"result":"..."}` / `{"enabled":true}` / 401）
- [ ] Step 2: 运行 → FAIL
- [ ] Step 3: 实现
- [ ] Step 4: 运行 → PASS
- [ ] Step 5: 提交

### Task 4: 设计系统 `theme.ts` + `ui.tsx`

**Files:**
- Create: `F50 Widget/theme.ts`、`F50 Widget/ui.tsx`
- Test: `F50 Widget/tests/theme.test.ts`（token 完整性与强调色读写）

**Interfaces:**
- Produces: `THEME`（间距/圆角/字号/语义色）、`loadAccent()/saveAccent()`、`loadAppearance()/saveAppearance()`、`loadMotion()/saveMotion()`、`softTint(color, alpha)`
- `ui.tsx` 导出：`SectionCard`、`DataRow`、`MetricTile`、`RingGauge`、`StatusPill`、`EmptyState`、`ErrorState`、`LoadingState`、`ConfirmDialog`

- [ ] Step 1–5: TDD（theme token 断言 + 强调色往返）

### Task 5: `phone_view.tsx`

**Files:** Create: `F50 Widget/phone_view.tsx`

**Interfaces:**
- Consumes: `call.ts`、`api.ts`（`fetchAT` / `fetchVolteState`）、`ui.tsx`
- Produces: `PhoneView`（最近通话 / 拨号盘 / 通话中三态；能力探测失败显示不可用态）

- [ ] Step 1: 写失败测试（源码级断言：必须含能力探测、二次确认、ATD 构造引用）
- [ ] Step 2: 运行 → FAIL
- [ ] Step 3: 实现
- [ ] Step 4: 运行 → PASS

### Task 6: `plugins_view.tsx`

**Files:** Create: `F50 Widget/plugins_view.tsx`

**Interfaces:**
- Consumes: `plugins.ts`、`api.ts`（`fetchPluginsText` / `savePluginsText`）、`ui.tsx`
- Produces: `PluginsView`（列表 / 详情 / 启停 / 删除 / 导出；空态与错误态）

### Task 7: `status_view.tsx` / `sms_view.tsx` / `settings_view.tsx`

**Files:** Create 三个视图文件；从现有 `index.tsx` 迁移并重做视觉。

**Interfaces:**
- `StatusView`：设备/SIM/速率/流量曲线（Charts）/硬件/Wi-Fi 客户端/快捷操作
- `SMSView`：会话列表 / 聊天详情 / 写短信（沿用 `fetchSMSMessages`、`sendSMS`）
- `SettingsView`：外观 / 后台 / 凭据 / 数据与设备 / 隐私 / 关于

### Task 8: `index.tsx` 五标签 + 文档

**Files:** Modify: `F50 Widget/index.tsx`、`README.md`、`script.json`（版本号）

**Interfaces:** `RootView` 五个 `Tab`：状态/短信/电话/插件/设置

### Task 9: 回归与验收

- [ ] 跑全部测试：`call` / `plugins` / `theme` / `regression`
- [ ] 检查 `widget.tsx` 未被破坏（`isEmpty` 分支仍在、无新增硬编码色）
- [ ] 复述未验证项（真机 Scripting 运行、Charts 渲染、AT 实机拨号）
