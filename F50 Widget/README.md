# F50 Widget

UFI-TOOLS / ZTE F50 网络状态**小组件**（Small / Medium / Large），展示今日/本月流量、信号、电池、CPU、内存、Wi-Fi，支持**点击刷新**与**离线缓存**。

**应用内自带设置页**：打开脚本即可输入 URL 与两个密码（SecureField 掩码输入）、测试连接、预览小组件。

## 订阅

```
https://github.com/TomCatXue/Scripting/tree/main/F50%20Widget
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
| `icons/` | 脚本图标（UFI-TOOLS 官方图标，透明背景） |

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

## 更新记录

### 2026-08-23：修复配置保存失效 / 预览读不到密码

**问题现象**

- 设置页填写密码后点「保存配置」提示「配置未保存成功」；
- 退出设置页重新打开，密码消失；
- 右上角「预览」读不到刚填写的配置，小组件显示「未配置密码」。

**根本原因**

`Storage`、`Keychain`、`FileManager` 在 Scripting 中均为**全局 API**，文档标注 *"globally available, does not need to be imported from 'scripting'"*。原代码将它们写进 `import { ... } from "scripting"`，运行时得到的是 `undefined`（日志可见 `TypeError: undefined is not an object (evaluating 'scripting_1.Storage.set')`），导致：

- 配置持久化三层（Storage / Keychain / App Group 配置文件）全部静默失败，UI 却显示保存成功；
- `widget_data.ts` 的小组件缓存同样失效（被 try-catch 静默吞掉）；
- 退出设置页后进程结束，未落盘的密码随之丢失。

**修复内容**

- `api.ts`：从 `"scripting"` 导入中移除 `Storage` / `Keychain` / `FileManager`，改为全局直接使用；`saveSetting` 重构为以 **Storage 为主存储**（设置页 / 小组件 / 预览共享同一脚本域），Keychain 写后读回验证、失败时清除旧值，App Group 配置文件作为冗余；`readSetting` 读取顺序调整为参数 → Storage → Keychain → 配置文件；
- `widget_data.ts`：移除错误的 `Storage` 导入，小组件离线缓存恢复可用；
- `index.tsx`：输入即保存（`onChanged` 即时持久化）、预览前强制保存当前表单值、保存校验改为依据分层写入结果，不再出现"假成功"。