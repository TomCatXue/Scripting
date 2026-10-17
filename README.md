<h1 align="center">Scripting Scripts</h1>

<p align="center">
  <b>iOS 桌面小组件 · 原生应用交互 · 自动化数据看板</b><br>
  为 iOS <a href="https://scripting.today">Scripting App</a> 精心打造的轻量脚本与小组件集合
</p>

<p align="center">
  <a href="https://github.com/TomCatXue/Scripting/stargazers"><img alt="stars" src="https://img.shields.io/github/stars/TomCatXue/Scripting?style=flat-square&color=4285dd" /></a>
  <a href="https://github.com/TomCatXue/Scripting/issues"><img alt="issues" src="https://img.shields.io/github/issues/TomCatXue/Scripting?style=flat-square&color=4285dd" /></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-4285dd?style=flat-square" /></a>
</p>

收拢随身 Wi-Fi 状态监控、模块化仪表盘看板与热搜资讯工具：
支持 iOS 17+ 原生 AppIntent 静默点击刷新、Keychain 安全凭据存储与 Small / Medium / Large 三尺寸无缝适配。

遇到问题、想加新脚本，欢迎提 [Issues](https://github.com/TomCatXue/Scripting/issues/new)；用着顺手的话，点个 ⭐ 就好。

## 脚本列表

|     | 名称 | 功能 | 尺寸 · 特性 | 安装 / 订阅 |
| :-: | :--- | :--- | :---: | :---: |
| <img src="F50%20Widget/icons/icon.png" height="20" /> | **[F50 Widget](./F50%20Widget)** | ZTE F50 / U60 网络状态监控与三标签原生应用（状态 / 短信 / 设置）：双端口轮询、实时速率、流量进度条、UCS-2 / Base64 多模态短信收发与验证码提取 | `Small / Medium / Large` · 点击刷新 | **[订阅](https://github.com/TomCatXue/Scripting/tree/main/F50%20Widget)** / **[说明](./F50%20Widget/README.md)** |
| <img src="https://raw.githubusercontent.com/luestr/IconResource/main/App_icon/120px/Loon.png" height="20" /> | **[MutePanel](./MutePanel)** | 哑巴面板（DashBoard-Kit 聚合看板套件）：模块化聚合看板，长按切换类型。涵盖 Media Nexus、AI 配额/用量求和（DeepSeek / WorkBuddy / Codex / Antigravity）、黄金行情、Loon 流量、2x2 Bento 栅格 | `Small / Medium / Large` · 静默刷新 | **[订阅](https://github.com/TomCatXue/Scripting/tree/main/MutePanel)** / **[说明](./MutePanel/README.md)** |
| <img src="https://weibo.com/favicon.ico" height="20" /> | **[Weibo](./Weibo)** | 微博热搜小组件 + 热搜原生浏览应用：实时热搜榜（热度角标、前 3 高亮）、深链直达微博国际版 / H5、应用内热搜列表下拉刷新与搜索 WebView 深色适配 | `Small / Medium / Large` · 原生跳转 | **[订阅](https://github.com/TomCatXue/Scripting/tree/main/Weibo)** / **[说明](./Weibo/README.md)** |

## 目录结构

```text
Scripting/
├── README.md          # 仓库总览与订阅索引
├── LICENSE            # MIT 开源许可证
├── WIDGET_GUIDE.md    # 小组件开发指南（创建/调试/审查规范）
├── F50 Widget/        # 脚本 1：F50 Widget（ZTE F50 / UFI 状态监控与短信管理）
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
3. 复制上方表格中对应脚本的 GitHub 目录链接（如 `https://github.com/TomCatXue/Scripting/tree/main/F50%20Widget`）并粘贴。
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

[MIT](./LICENSE)

## 免责声明

本项目仅供**个人学习研究与自用自动化**，请勿用于商业用途、批量操作或违反平台服务条款的行为。

脚本会接触你的网络配置或账号凭据（如 UFI 访问密码、ZTE 路由器密码、API Token 等），但全部只保存在**你自己的设备 Keychain 与本地 Storage** 中，本仓库不上传、不收集任何敏感数据。

使用所产生的网络变动、服务受限等后果由使用者自行承担。部分脚本改编自社区开源项目，版权归原作者所有；如认为内容侵权，请提 Issue 联系删除。
