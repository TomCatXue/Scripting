# Scripting Scripts

为 iOS [Scripting App](https://scripting.today) 开发的脚本集合仓库。每个脚本独立成文件夹，可通过 Scripting App 的链接**直接订阅下载**。

## 脚本列表

| 脚本 | 说明 | 支持尺寸 | 订阅链接 |
|---|---|---|---|
| [UfiPeek](./UfiPeek) | ZTE F50（UFI-TOOLS）网络状态监控小组件：流量、信号、电池、CPU、内存、Wi-Fi 频段与未读短信 | Small / Medium / Large | `https://github.com/TomCatXue/Scripting/tree/main/UfiPeek` |

## 订阅方式

在 Scripting App 中添加时粘贴对应脚本的 GitHub 文件夹链接（即上表最后一列），App 会读取该文件夹下的 `script.json`，根据其中的 `remoteResource` 定期同步更新：

```json
"remoteResource": {
  "url": "https://github.com/TomCatXue/Scripting/tree/main/UfiPeek",
  "autoUpdateInterval": 86400
}
```

| 字段 | 说明 |
|---|---|
| `url` | GitHub 上存放该脚本文件的文件夹地址（`/tree/main/<脚本名>`） |
| `autoUpdateInterval` | 自动检查更新间隔（秒）。`86400` = 每天一次，`null` = 仅手动更新 |
| `hash` | 远程内容校验值（由 App 首次同步时生成），无需手动维护 |

## 目录结构

推荐结构：每个脚本为一个顶层文件夹，脚本自身的 `script.json`、入口与核心文件都放在该文件夹内，方便独立订阅：

```
Scripting/
├── README.md              # 本文件：仓库总览
├── UfiPeek/               # 脚本 1：UfiPeek 小组件
│   ├── script.json        # Scripting 项目配置（含 remoteResource）
│   ├── index.tsx          # 入口（Widget.preview）
│   ├── widget.tsx         # 小组件核心（Small / Medium / Large）
│   └── README.md          # 脚本自身的说明与配置
└── <新脚本>/              # 后续脚本按同样约定新增
```

## 新增脚本

1. 新建顶层文件夹 `<脚本名>/`；
2. 放入 `script.json`、入口文件与脚本源码；
3. `script.json` 至少包含以下字段：

```json
{
  "name": "<脚本显示名>",
  "entry": "index.tsx",
  "icon": "<SF Symbol 名称>",
  "color": "#HEX",
  "version": "1.0.0",
  "description": "<一行英文描述>",
  "author": "<你的用户名>",
  "remoteResource": {
    "url": "https://github.com/TomCatXue/Scripting/tree/main/<脚本名>",
    "autoUpdateInterval": 86400
  }
}
```

---

## UfiPeek

UFI-TOOLS / ZTE F50 网络状态监控小组件，展示**今日/本月流量、信号、电池、CPU 温度/占用、内存、Wi-Fi 频段、运营商、未读短信**等状态，支持透明背景。

### 配置参数（重要）

密码不在仓库中硬编码，通过脚本参数或 Storage 配置：

| 参数 | 说明 |
|---|---|
| `URL` | UFI-TOOLS 地址，默认 `http://192.168.0.1:2333` |
| `password` | UFI-TOOLS 密码 |
| `zte_password` | ZTE 后台密码（zreq 自动登录用） |

示例（Scripting 运行参数）：

```json
{"URL":"http://192.168.0.1:2333","password":"your-ufi-tools-password","zte_password":"your-zte-password"}
```

### 技术要点

- zreq 自动完成 ZTE 登录；失败时回退 GET-only goform + POST 登录
- UFI-TOOLS 签名：`minikano+method+path+timestamp` → HMAC-MD5 → 双 SHA256
- RSRQ/SNR 通过 `network_information` 单独查询（multi_data=1 批量请求不返回质量字段）
- 信号格：`network_signalbar` 为空时由 RSRP 推算（≥-85 → 4 格 …）
- 透明模式：`Widget.isTransparentMode || Widget.isBlurMode` 时用透明背景 + 半透明药丸背景

> 注：`widget.tsx` 中的 `secretKey` 是 UFI-TOOLS 客户端通用的签名常量，并非个人凭据。请务必通过参数配置你自己的密码。

## License

仅供学习参考。
