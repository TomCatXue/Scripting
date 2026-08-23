# UfiPeek

UFI-TOOLS / ZTE F50 网络状态**小组件**（Small / Medium / Large），展示今日/本月流量、信号、电池、CPU、内存、Wi-Fi，支持**点击刷新**与**离线缓存**。

**应用内自带设置页**：打开脚本即可输入 URL 与两个密码（SecureField 掩码输入）、测试连接、预览小组件。

## 订阅

```
https://github.com/TomCatXue/Scripting/tree/main/UfiPeek
```

## 文件

| 文件 | 说明 |
|---|---|
| `script.json` | 项目配置（含订阅 `remoteResource`） |
| `index.tsx` | 入口（设置页：URL/密码配置、测试连接、小组件预览） |
| `widget.tsx` | 小组件 UI（语义色、动态字号、点击刷新、缓存容错） |
| `widget_data.ts` | 数据组装与缓存 |
| `api.ts` | UFI-TOOLS / ZTE 网络层（签名、登录、shell） |
| `app_intents.tsx` | 点击刷新 AppIntent |

## 配置参数

| 参数 | 说明 |
|---|---|
| `URL` | UFI-TOOLS 地址，默认 `http://192.168.0.1:2333` |
| `password` | UFI-TOOLS 密码 |
| `zte_password` | ZTE 后台密码（zreq / 登录回退用） |

示例：

```json
{"URL":"http://192.168.0.1:2333","password":"your-password","zte_password":"your-zte-password"}
```

> 注：`api.ts` 中的 `SECRET_KEY` 是 UFI-TOOLS 客户端通用的签名常量，并非个人凭据。请通过参数配置自己的密码，勿提交真实密码。