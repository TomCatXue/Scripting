# Scripting 小组件开发指南

> 基于 iOS [Scripting App](https://scripting.today) 的实践总结。  
> 涵盖项目结构、script.json 配置、代码分层、数据流、刷新机制、缓存策略、调试技巧与审查清单。

---

## 目录

1. [项目结构](#1-项目结构)
2. [script.json 配置](#2-scriptjson-配置)
3. [代码分层](#3-代码分层)
4. [小组件生命周期](#4-小组件生命周期)
5. [数据流](#5-数据流)
6. [点击刷新（AppIntent）](#6-点击刷新appintent)
7. [缓存策略](#7-缓存策略)
8. [UI 模式](#8-ui-模式)
9. [调试技巧](#9-调试技巧)
10. [审查清单](#10-审查清单)

---

## 1. 项目结构

```
<脚本名>/
├── script.json        # 项目配置（必选）
├── index.tsx          # App 内入口：TabView 多标签页（状态/短信/设置等）（可选，但推荐）
├── widget.tsx         # 小组件入口：UI + run()（必选）
├── widget_data.ts     # 数据层：抓取、缓存、状态组装（推荐）
├── api.ts             # 网络层：API 请求、签名、认证（推荐，按需）
├── app_intents.tsx    # 点击刷新 AppIntent（推荐，widget 交互用）
├── icons/             # 脚本图标（透明 PNG，多尺寸，可选）
│   ├── icon.png       # 1024×1024
│   ├── icon-512.png
│   ├── icon-256.png
│   └── icon-64.png
└── README.md          # 脚本说明
```

**核心原则：** 每个文件只负责一件事。`widget.tsx` 只做 UI 渲染 + 入口调度，数据逻辑拆到 `widget_data.ts`，网络请求拆到 `api.ts`。

> **多标签架构推荐：** 当 App 内需要多个功能页时，使用 Scripting 的 `TabView` + `Tab` 组件实现底部标签栏。每个 `Tab` 对应一个独立视图（如状态页、短信页、设置页），通过 `useObservable` 绑定选中状态。参考 F50 Widget 的 `index.tsx` 实现。

---

## 2. script.json 配置

```json
{
  "name": "脚本显示名",
  "entry": "index.tsx",
  "icon": "wifi.router.fill",          // SF Symbol 名称（必填）
  "iconImage": "https://.../icon.png",  // 自定义图标 URL（可选，推荐）
  "color": "#0A84FF",                   // 脚本列表中的主题色
  "version": "1.0.0",
  "description": "一行英文描述，显示在脚本列表",
  "author": {
    "name": "GitHub用户名",
    "homepage": "https://github.com/用户名",
    "email": null
  },
  "contributors": [],
  "localizedNames": {
    "zh": "中文名",
    "zh-Hans": "中文名（简体）"
  },
  "localizedDescriptions": {
    "zh-Hans": "中文描述"
  },
  "permissions": null,
  "intentInputTypes": [],
  "runInApp": false,                    // false = 主要作为小组件/widget
  "remoteResource": {                   // 订阅更新（GitHub 仓库必填）
    "url": "https://github.com/用户/仓库/tree/main/脚本名",
    "autoUpdateInterval": 86400,        // 自动检查更新间隔（秒），null=手动
    "hash": ""                          // 首次同步后 App 自动填充
  }
}
```

### 关键字段说明

| 字段 | 说明 | 必填 |
|---|---|---|
| `name` | 脚本显示名，会出现在小组件列表 | 是 |
| `entry` | App 内运行时的入口文件 | 是 |
| `icon` | SF Symbol 名称，小组件列表的图标 | 是 |
| `iconImage` | 自定义图标 URL，覆盖 icon 的显示 | 推荐 |
| `color` | 主题色，十六进制或 rgba | 是 |
| `version` | 语义化版本号，更新时增加 | 推荐 |
| `runInApp` | `false` = 作为小组件/扩展，`true` = 作为独立 App | 是 |
| `remoteResource` | 订阅更新机制，`url` 指向 GitHub 文件夹 | 仓库脚本必填 |

### remoteResource 订阅机制

用户在 Scripting App 中粘贴 `remoteResource.url`（GitHub 文件夹链接），App 会：
1. 下载该文件夹下的所有文件
2. 根据 `autoUpdateInterval` 定期检查更新
3. 首次同步时自动生成 `hash`，后续对比 hash 判断是否有变化

```json
"remoteResource": {
  "url": "https://github.com/User/Repo/tree/main/MyScript",
  "autoUpdateInterval": 86400,  // 每天检查一次
  "hash": ""
}
```

---

## 3. 代码分层

### 3.1 网络层（`api.ts`）

职责：所有 API 请求、签名、认证逻辑。

**最佳实践：**
- 每个请求函数都返回 `Promise`，内部 `try/catch` 不抛错
- 配置读取函数（`readSetting`）放在此处，与 `Storage` 交互
- 导出 `saveSetting()` 供设置页写入
- 请求超时设为 15 秒（`req.timeout = 15`）

```ts
export function readSetting(key: string, fallback?: string): string {
  // 读取顺序：Script.queryParameters → Widget.parameter → Storage
  // 在页面环境用 Storage，在 widget 环境用 Widget.parameter
}

export function saveSetting(key: string, value: string): void {
  Storage.set("Prefix." + key, value);
}
```

### 3.2 数据层（`widget_data.ts`）

职责：组合 API 数据、状态组装、缓存读写、格式化工具。

**关键函数：**

```ts
// 空状态（小组件首次加载/失败时显示）
export function emptyState(): WidgetState { ... }

// 状态组装（把 API 原始数据转为组件可用的 UI 状态）
export function buildState(rawData): WidgetState { ... }

// 抓取完整数据（并行请求，带容错）
export async function fetchWidgetSnapshot(): Promise<{ state, error }> {
  // 使用 Promise.allSettled 并行请求多个接口
  // 每个失败单独记录 errors 数组
  // 成功的数据走 buildState
}

// 缓存读写
export function readWidgetCache(): WidgetState | null { ... }
export function saveWidgetCache(state: WidgetState): void { ... }
```

**并行请求模式（推荐）：**

```ts
const [result1, result2] = await Promise.allSettled([
  fetchData1(),
  fetchData2(),
]);
```

### 3.3 UI 层（`widget.tsx`）

职责：三种尺寸的视图渲染 + `run()` 入口。

**核心模式：**

```tsx
async function run() {
  // 1. 读缓存
  const cached = readWidgetCache();
  let data = cached ?? emptyState();
  let error = null;

  // 2. 检查配置（无配置直接显示提示，不发起请求）
  if (hasConfig) {
    try {
      const fresh = await fetchWidgetSnapshot();
      saveWidgetCache(fresh.state);
      data = fresh.state;
      error = fresh.state.error;
    } catch (e) { ... }
  } else {
    error = "未配置，请先在设置页配置";
  }

  // 3. 渲染
  Widget.present(<WidgetView data={data} error={error} />, {
    reloadPolicy: { policy: "after", date: new Date(Date.now() + RELOAD_MS) },
  });
  Script.exit();
}
```

### 3.4 设置页（`index.tsx`）

职责：App 内配置界面，用于输入 URL、密码、Token 等参数。

**参考模式（Navigation + List + Section 表单）：**

```tsx
function MainView() {
  const [url, setUrl] = useState(readSetting("URL", "default"));
  const [password, setPassword] = useState(readSetting("password", ""));

  function handleSave() {
    saveSetting("URL", url.trim());
    saveSetting("password", password.trim());
    // ...
  }

  return (
    <NavigationStack>
      <List navigationTitle="配置">
        <Section header={<Text>连接</Text>}>
          <TextField title="URL" value={url} onChanged={setUrl} prompt="默认URL" />
          <SecureField title="密码" value={password} onChanged={setPassword} prompt="输入密码" />
          <Button title="保存配置" action={handleSave} />
          <Button title="测试连接" action={handleTest} />
        </Section>
      </List>
    </NavigationStack>
  );
}

async function run() {
  await Navigation.present({ element: <MainView /> });
  Script.exit();
}
```

---

## 4. 小组件生命周期

```
用户添加小组件
  → Scripting 启动 widget.tsx 的 run()
  → 读取缓存（如果有）
  → 并行抓取数据（Promise.allSettled）
  → 保存新缓存
  → Widget.present(<WidgetView />) 渲染
  → Script.exit() 结束
  ↓
15 分钟后（reloadPolicy）
  → 自动重新 run()
  ↓
用户点击小组件（AppIntent）
  → perform() 执行抓取→保存缓存→Widget.reloadAll()
  → 小组件重新 run()
```

### run() 的执行顺序

1. **读缓存** — 优先显示上次数据，保证首次渲染不空白
2. **检查配置** — 没有配置（密码/Token 等）直接跳过请求，避免卡在加载
3. **并行抓取** — 所有接口同时请求，最快速度返回
4. **写缓存** — 无论成功失败，都保存最新状态
5. **渲染** — `Widget.present` 是唯一渲染入口
6. **退出** — `Script.exit()` 必须调用，否则进程挂起

### Widget.present 参数

```ts
Widget.present(<WidgetView />, {
  reloadPolicy: {
    policy: "after",          // 固定时间后刷新
    date: new Date(Date.now() + RELOAD_MS),
  },
});
```

---

## 5. 数据流

```
设置页 (index.tsx)         小组件 (widget.tsx)
  │                          │
  ├─ saveSetting("URL")      ├─ run()
  │  → Storage.set           │  ├─ readWidgetCache()
  │                          │  ├─ fetchWidgetSnapshot()
  ├─ handleTest()            │  │  ├─ fetchDeviceInfo()     ← api.ts
  │  → fetchWidgetSnapshot() │  │  ├─ fetchGoformAll()      ← api.ts
  │                          │  │  └─ fetchSystemInfo()     ← api.ts
  │                          │  ├─ saveWidgetCache()
  └─ Widget.preview()        │  └─ Widget.present()
        → 运行 widget.tsx    │
                             └─ 用户点击小组件
                                → AppIntent: RefreshF50WidgetIntent
                                  → fetchWidgetSnapshot()
                                  → saveWidgetCache()
                                  → Widget.reloadAll()
```

---

## 6. 点击刷新（AppIntent）

### 注册

```tsx
// app_intents.tsx
import { AppIntentManager, AppIntentProtocol, Widget } from "scripting";
import { fetchWidgetSnapshot, saveWidgetCache } from "./widget_data";

export const RefreshIntent = AppIntentManager.register({
  name: "RefreshIntentName",      // 唯一标识
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => {
    try {
      const { state } = await fetchWidgetSnapshot();
      saveWidgetCache(state);
    } catch (e) {
      console.log("刷新失败", String(e?.message || e));
    }
    Widget.reloadAll();           // 必须调用，触发小组件重渲染
  },
});
```

### 在 widget UI 中使用

```tsx
import { RefreshIntent } from "./app_intents";

<Button intent={RefreshIntent(undefined)} buttonStyle="plain">
  {/* 整个小组件内容包在这里，点击任何位置都刷新 */}
</Button>
```

**注意：** `buttonStyle="plain"` 让按钮不显示点击高亮，适合整块包裹。

---

## 7. 缓存策略

### 写缓存（抓取成功后）

```ts
saveWidgetCache(state);
// 内部：Storage.set(CACHE_KEY, JSON.stringify(state));
```

### 读缓存（run() 开始时）

```ts
const cached = readWidgetCache();
// 内部：Storage.get(CACHE_KEY) → JSON.parse
```

### 缓存容错（抓取失败时）

```ts
if (cached) {
  data = cached;         // 显示旧数据
  error = "数据可能已过期 ⚠";
} else {
  data = emptyState();   // 显示空状态占位
  error = "获取失败";
}
```

### 缓存 Key 设计

```ts
const CACHE_KEY = "ProjectName.widget.cache.v1";
// 每次数据格式变更时升级版本号，避免反序列化错误
```

---

## 8. UI 模式

### 8.1 三种尺寸分发

```tsx
export function WidgetView({ data, error, family }) {
  const fam = family ?? Widget.family;
  const inner = fam === "systemSmall"
    ? <SmallView data={data} />
    : fam === "systemLarge"
      ? <LargeView data={data} />
      : <MediumView data={data} />;
  return <Button intent={RefreshIntent(undefined)} buttonStyle="plain">{inner}</Button>;
}
```

### 8.2 空状态 / 错误状态

```tsx
const isEmpty = !data || !data.update_time || data.update_time === "--";

if (isEmpty) {
  return (
    <VStack spacing={6} alignment="center">
      <Image systemName="exclamationmark.icloud" ... />
      <Text>{error?.includes("未设置") ? "未配置密码" : (error ? "获取失败" : "名称")}</Text>
      <Text>{error?.includes("未设置") ? "打开脚本配置" : "点击重试"}</Text>
    </VStack>
  );
}
```

### 8.3 系统语义色（推荐）

使用系统语义色替代硬编码十六进制颜色，自动适配深色/浅色模式：

```tsx
// ✅ 推荐
foregroundStyle("systemBlue")
foregroundStyle("systemGreen")
foregroundStyle("systemRed")
foregroundStyle("systemOrange")
foregroundStyle("systemTeal")
foregroundStyle("systemIndigo")
foregroundStyle("systemPurple")
foregroundStyle("systemPink")
foregroundStyle("systemCyan")
foregroundStyle("systemYellow")
foregroundStyle("label")
foregroundStyle("secondaryLabel")
foregroundStyle("separator")
foregroundStyle("systemBackground")

// ❌ 不推荐
foregroundStyle("#0056D6")
foregroundStyle("#16A34A")
```

### 8.4 透明背景模式

```tsx
function widgetBg() {
  const isTransparent = Widget.isTransparentBackground || Widget.isTransparentMode || Widget.isBlurMode;
  return isTransparent ? "clear" : "systemBackground";
}

function pillBg() {
  const isTransparent = Widget.isTransparentBackground || Widget.isTransparentMode || Widget.isBlurMode;
  let isDark = false;
  try { isDark = Device.colorScheme === "dark"; } catch (_) {}
  return isTransparent
    ? (isDark ? "rgba(28,28,30,0.5)" : "rgba(242,242,247,0.5)")
    : "secondarySystemBackground";
}
```

### 8.5 常用组件

| 组件 | 用途 |
|---|---|
| `VStack`, `HStack`, `ZStack` | 布局容器 |
| `Text` | 文字显示，支持 `font`、`foregroundStyle`、`fontWeight`、`modifiers().lineLimit()` |
| `Image` | SF Symbol 图标，支持 `systemName`、`variableValue`（信号栏填充） |
| `Spacer` | 弹性撑开，`minLength` 控制最小间距 |
| `Button` | 按钮，支持 `intent`（AppIntent）、`action`（普通回调） |
| `modifiers()` | 链式修饰符：`foregroundStyle`、`background`、`clipShape`、`frame`、`padding`、`offset`、`bold`、`monospacedDigit`、`lineLimit`、`minScaleFactor` |

---

## 9. 调试技巧

### 9.1 console.log

Scripting 的 `console.log` 输出只在 App 内的调试面板可见（widget 运行时不可见）。用于追踪数据流：

```ts
console.log("fetch result:", JSON.stringify(result));
```

### 9.2 Widget.preview

在 `index.tsx` 中用 `Widget.preview` 在 App 内预览小组件效果：

```tsx
async function handlePreview(family: string) {
  try {
    await Widget.preview({ family: family as any });
  } catch (e) {
    console.log("预览失败", e);
  }
}
```

### 9.3 常见 Bug 排查

| 现象 | 可能原因 |
|---|---|
| 小组件一直转圈 | `run()` 中网络请求卡住 → 加 `timeout` 或前置配置检查 |
| 小组件显示空白 | `Widget.present` 未调用或 `Script.exit()` 过早执行 |
| 设置页保存后密码丢失 | 存储 key 前缀不一致 → 统一 `readSetting`/`saveSetting` 前缀 |
| 点击刷新无效 | AppIntent 未正确注册或 `Widget.reloadAll()` 未调用 |
| 设置页 TextField 无法输入 | 导入 `useState` 了吗？确认 `from "scripting"` 包含 |
| 图标在脚本列表中太小 | 图标主体占画布比例小 → 裁掉透明边缘再放大填充 |
| 订阅后文件不更新 | `remoteResource.hash` 未更新 → 删除旧脚本重新订阅 |

### 9.4 开发工作流

```
1. 本地编辑代码（VS Code）
2. 通过 scripting-ts sync 同步到手机（或手动复制）
3. 在 Scripting App 中打开脚本测试
4. 用 Widget.preview 预览小组件
5. 调试 console.log 输出
6. 确认无误后 git push 到 GitHub
7. 用户在手机上重新订阅（或更新）
```

---

## 10. 审查清单

### 创建新小组件时检查

- [ ] `script.json` 是否包含所有必填字段（name/icon/color/entry/version）
- [ ] `remoteResource` 是否配置正确，`url` 指向正确的 GitHub 文件夹
- [ ] `iconImage` 是否指向可访问的远程图标 URL
- [ ] 文件夹名是否与 `remoteResource.url` 中的路径一致
- [ ] 存储 key 前缀是否统一（`readSetting`/`saveSetting` 一致）

### 代码质量

- [ ] 网络请求是否设置了 `timeout`
- [ ] 所有请求是否包裹在 `try/catch` 中（不抛未处理异常）
- [ ] 是否做了「无配置不请求」的前置检查（避免卡加载）
- [ ] 缓存读写是否正确（`emptyState` → `readWidgetCache` → `saveWidgetCache`）
- [ ] 三种尺寸（Small/Medium/Large）是否都有对应视图
- [ ] 按钮是否包裹了 `AppIntent`（点击刷新）
- [ ] `Widget.present` 是否只调用一次，`Script.exit()` 是否在最后
- [ ] 颜色使用系统语义色，没有硬编码十六进制色值
- [ ] 透明背景模式是否做了适配（`Widget.isTransparentMode`）
- [ ] 文件是否按职责拆分（网络层 / 数据层 / UI 层 / 设置页 / 意图）

### 部署前

- [ ] 所有文件已提交到 GitHub
- [ ] 远程仓库中的文件结构与本地一致
- [ ] 在 Scripting App 中测试订阅链接可正常下载
- [ ] 小组件在三种尺寸下都能正常显示
- [ ] 点击刷新功能正常
- [ ] 设置页保存配置后，小组件能读取到新配置
- [ ] 无密码时显示提示，不卡在加载
- [ ] 抓取失败时显示缓存数据（如果有）或错误提示
- [ ] 图标在脚本列表中可正常显示

---

## 附录：参考仓库

- [xubai2001/Scriptings](https://github.com/xubai2001/Scriptings) — 多脚本集合，多文件结构，设置页模式
- [Primovist/Scripting](https://github.com/Primovist/Scripting) — U60 Pro 状态，订阅机制参考
- [TomCatXue/Scripting](https://github.com/TomCatXue/Scripting) — F50 Widget，本指南的实践基础