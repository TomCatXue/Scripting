# Scripting Scripts

为 iOS [Scripting App](https://scripting.today) 开发的脚本集合仓库，每个脚本独立文件夹，可直接**订阅下载**。

## 脚本列表

| 脚本 | 说明 | 尺寸 | 订阅链接 |
|---|---|---|---|
| [F50 Widget](./F50%20Widget) | ZTE F50（UFI-TOOLS）网络状态小组件 + 三标签应用（状态 / 短信 / 设置）：双端口轮询（80 匿名 + 2333 签名）+ 候选 Token 轮询；实时上下行速率、套餐流量进度条与重置倒计时、信号质量评级、QoS 指标；短信会话列表、验证码提取与一键复制、写短信；小组件支持 Small / Medium / Large 三种尺寸、点击刷新与离线缓存 | Small / Medium / Large | `https://github.com/TomCatXue/Scripting/tree/main/F50%20Widget` |
| [MutePanel](./MutePanel) | 哑巴面板（DashBoard-Kit 仪表盘套件）：模块化聚合看板小组件套件，长按小组件在「参数」中自由切换类型。涵盖 Media Nexus（Emby / MoviePilot 影视库）、DeepSeek / WorkBuddy / Codex / Antigravity（多账号配额/余额/用量求和聚合）、CPAMP 监控、公网 IP/VPN 节点、今日油价（贝壳小号/四联中号）、Au9999 黄金实时行情、GitHub 热门库与粉丝监控、Loon 网络流量监控、2x2 Bento 大号栅格。支持 iOS 17+ 原生 AppIntent 静默点击刷新与 Keychain 安全凭据存储 | Small / Medium / Large | `https://github.com/TomCatXue/Scripting/tree/main/MutePanel` |
| [Weibo](./Weibo) | 微博热搜小组件 + 热搜应用：实时热搜榜（热度角标、前 3 高亮）、右上角时钟与版本标记、点击条目按设置跳转（微博国际版深链 / H5 兜底）、点击 Logo 打开热搜总榜；App 内热搜列表（下拉刷新）、WebView 搜索页（深色样式适配）、设置页（字号 / 配色 / 背景 / 图标染色自定义） | Small / Medium / Large | `https://github.com/TomCatXue/Scripting/tree/main/Weibo` |

## 目录结构

```
Scripting/
├── README.md          # 仓库总览与订阅索引
├── WIDGET_GUIDE.md    # 小组件开发指南（创建/调试/审查规范）
├── F50 Widget/        # 脚本 1：F50 Widget（ZTE F50 / UFI 状态监控）
│   ├── script.json    # 项目配置（含订阅 remoteResource、图标、版本）
│   ├── index.tsx      # 入口（TabView 三标签：状态页/短信页/设置页）
│   ├── widget.tsx     # 小组件 UI（Small / Medium / Large，含速率/进度条/信号评级/QoS）
│   ├── widget_data.ts # 数据组装与缓存（双端口合并、速率/流量限额/信号评级/QoS）
│   ├── api.ts         # UFI-TOOLS / ZTE 网络层（双端口轮询、签名、登录、SMS 收发、QoS、验证码提取）
│   ├── app_intents.tsx# 点击刷新 AppIntent
│   ├── icons/         # 脚本图标（透明 PNG，多尺寸）
│   └── README.md      # 脚本配置与参数说明
├── MutePanel/         # 脚本 2：哑巴面板（DashBoard-Kit 聚合看板套件）
│   ├── script.json    # 项目配置（含订阅 remoteResource、图标、版本）
│   ├── index.tsx      # App 可视化配置与数据源管理面板（多账号增删改、凭据导入、缓存清理）
│   ├── widget.tsx     # 小组件 UI 调度入口（根据 family 尺寸与 widgetParameter 分发渲染）
│   ├── cards.tsx      # 看板卡片实现（Media / 余额 / 配额 / 节点 / Bento 等）
│   ├── templates.tsx  # 看板通用版式模板（趋势折线图、双列指标、四联卡片等）
│   ├── data.ts        # 各服务数据抓取、缓存水合与 Keychain 凭据读写
│   ├── aggregate.ts   # 多账号用量与配额求和/平均聚合引擎
│   ├── accounts.ts    # 多账号元数据与状态管理
│   ├── wb_direct.ts   # WorkBuddy OAuth 凭据直连、多账号解析与静默续期
│   ├── oauth.ts       # Codex / ChatGPT OAuth 认证链路
│   ├── app_intents.tsx# iOS 17+ 原生静默刷新 AppIntent
│   ├── theme.ts       # 主题配色与 iOS 语义颜色系统
│   ├── icons.ts       # SF Symbols 与微图标集
│   ├── assets/        # 本地服务 Logo 与图标资源
│   ├── tests/         # Node.js 原生回归与单元测试套件
│   ├── TEMPLATES.md   # 设计版式与卡片模板规范
│   └── README.md      # 看板参数、配置与多账号口径说明
└── Weibo/             # 脚本 3：微博热搜
    ├── script.json    # 项目配置（含订阅 remoteResource、图标、版本）
    ├── index.tsx      # 入口（热搜列表 + 深链跳转）
    ├── widget.tsx     # 小组件 UI（热搜榜 + 时钟/版本 + Logo）
    ├── app_intents.tsx# 点击跳转 AppIntent（国际版深链 / H5 兜底）
    ├── intent.tsx     # 快捷指令 Intent 调试页
    ├── apis/          # 网络层（weibo.ts 热搜接口）
    ├── components/    # 列表行组件（HotSearch.tsx）
    ├── pages/         # 页面（Search WebView / Settings）
    ├── store/         # 设置状态管理（settings.ts）
    ├── styles/        # 搜索页深色样式（dark.css）
    └── README.md      # 脚本配置说明
```

## 订阅方式

1. 在 iOS 设备上安装 [Scripting App](https://scripting.today)。
2. 进入 App 底部导航「订阅」Tab，点击右上角「+」或「添加订阅」。
3. 复制上方表格中对应脚本的 GitHub 目录链接（如 `https://github.com/TomCatXue/Scripting/tree/main/MutePanel`）并粘贴。
4. 点击下载，安装完成后即可在「脚本」列表中点击运行或在桌面添加小组件使用。

## 本地测试

本项目各脚本均配有 Node.js 原生测试套件（基于 `node:test` 与 `node:assert/strict`），通过自定义模块 loader 模拟 Scripting 环境全局变量与 API：

```bash
# 运行 F50 Widget 回归测试
node --import "./F50 Widget/tests/register.mjs" "./F50 Widget/tests/regression.test.ts"

# 运行 MutePanel 单元与功能回归测试
node --import "./MutePanel/tests/register.mjs" "./MutePanel/tests/accounts.test.ts"
node --import "./MutePanel/tests/register.mjs" "./MutePanel/tests/aggregate.test.ts"
node --import "./MutePanel/tests/register.mjs" "./MutePanel/tests/wb_direct.test.ts"
node --import "./MutePanel/tests/register.mjs" "./MutePanel/tests/data.test.ts"
node --import "./MutePanel/tests/register.mjs" "./MutePanel/tests/render.test.ts"
node --import "./MutePanel/tests/register.mjs" "./MutePanel/tests/entry.test.ts"
```

## License

仅供学习参考。