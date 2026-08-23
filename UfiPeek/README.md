# UfiPeek

UFI-TOOLS / ZTE F50 网络状态监控**小组件**（Small / Medium / Large），支持透明背景。

展示：今日/本月流量、信号强弱与 RSRP/RSRQ/SNR、电池电量、CPU 温度与占用、内存、Wi-Fi 频段（2.4G/5G）与设备数、运营商、未读短信、固件版本。

## 文件

| 文件 | 说明 |
|---|---|
| `script.json` | Scripting 项目配置（含订阅用的 `remoteResource`） |
| `index.tsx` | 入口，仅做 `Widget.preview` |
| `widget.tsx` | 小组件核心：数据获取、登录/签名逻辑、UI 渲染 |

## 配置参数（重要）

密码不硬编码，通过脚本参数或 Storage 配置：

| 参数 | 说明 |
|---|---|
| `URL` | UFI-TOOLS 地址，默认 `http://192.168.0.1:2333` |
| `password` | UFI-TOOLS 密码 |
| `zte_password` | ZTE 后台密码（zreq / 登录回退用） |

示例：

```json
{"URL":"http://192.168.0.1:2333","password":"your-password","zte_password":"your-zte-password"}
```

## 工作原理

1. `GET /api/baseDeviceInfo` → 设备信息（型号、固件、流量、CPU、电池）
2. `POST /api/user_shell` → 通过 zreq 自动完成 ZTE 登录并批量获取 goform 字段
3. `POST /api/root_shell` → root 权限取 Wi-Fi 频段（dumpsys wifi）与内存（/proc/meminfo）
4. zreq 失败时回退：GET-only goform → 必要时 POST 登录

签名：`minikano+method+path+timestamp` → HMAC-MD5 → 双 SHA256（secretKey 为 UFI-TOOLS 公共常量）。

> 请在 Scripting 中通过参数配置你自己的密码，勿把真实密码提交到仓库。