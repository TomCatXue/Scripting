# F50 Widget

ZTE F50（UFI-TOOLS）网络状态监控**小组件** + **三标签应用**（状态 / 短信 / 设置）。

## 功能概览

### 小组件（Small / Medium / Large）
- 今日/本月流量、信号、电池、CPU、内存、Wi-Fi 设备数
- 实时上下行速率展示与动态着色
- 套餐流量进度条（变色）与重置倒计时
- 信号质量评级（极佳/良好/一般/较差）
- QoS 指标（QCI + 上下行 AMBR）
- 点击刷新（AppIntent）与离线缓存容错

### 状态页（标签 1）
- 设备与信号：设备名、信号格、运营商、QCI 等级、频段、信号质量、RSRP/RSRQ/SNR
- 实时速率：上下行速率动态着色
- 流量统计：今日/本月/套餐用量/使用比例/重置倒计时
- 硬件指标：温度/CPU/内存/Wi-Fi 设备数/Wi-Fi 频段/SSID
- 电池与状态：电池电量/zreq 登录状态/UFI 版本/未读短信
- QoS 速率：上下行 AMBR

### 短信页（标签 2）
- 会话列表：按号码分组，未读高亮，验证码自动提取（🔑 红色标记）
- 会话详情：消息气泡，一键复制验证码到剪贴板
- 写短信：号码 + 内容输入，root_shell / goform 双策略发送

### 设置页（标签 3）
- URL / UFI 密码 / ZTE 密码配置（默认密文，可切换显隐）
- 测试连接验证配置
- 预览小组件（单按钮，预览中变色）

## 技术架构
- **双端口轮询**：ZTE 80 端口匿名读取 + UFI 2333 端口签名读取，数据合并
- **候选 Token 轮询**：SHA256 多变体 + admin 免底，遇 401 自动切换
- **多策略登录**：zreq 二进制 > POST 登录 > GET-only 兑底

## 订阅

```
https://github.com/TomCatXue/Scripting/tree/main/F50%20Widget
```

## 文件

| 文件 | 说明 |
|---|---|
| `script.json` | 项目配置（含订阅 `remoteResource`） |
| `index.tsx` | 入口（TabView 三标签：状态页/短信页/设置页） |
| `widget.tsx` | 小组件 UI（Small/Medium/Large，含速率/进度条/信号评级/QoS） |
| `widget_data.ts` | 数据组装与缓存（双端口合并、速率/流量限额/信号评级/QoS） |
| `api.ts` | UFI-TOOLS / ZTE 网络层（双端口轮询、签名、登录、SMS 收发、QoS、验证码提取） |
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

### 2026-08-26：三标签应用 + 双端口轮询 + SMS 短信功能

**新增功能**
- **三标签布局**（参考 koldllc/f50-monitor）：状态 / 短信 / 设置，使用 Scripting `TabView` + `Tab` 组件
- **双端口轮询**：ZTE 80 端口匿名读取流量/硬件字段 + UFI 2333 端口签名读取鉴权字段，数据合并
- **候选 Token 轮询**：SHA256 多变体 + admin 免底，遇 401/403 自动切换
- **SMS 短信功能**：会话列表、验证码提取与一键复制、写短信（root_shell + goform 双策略）
- **QoS 指标**：AT 命令获取 QCI 和上下行 AMBR
- **状态页**：List + insetGrouped 样式，展示所有字段（信号/速率/流量/硬件/电池/QoS）
- **设置页**：密码默认密文、预览单按钮变色

**Bug 修复**
- 状态页 Text 嵌套导致乱码 → 重写为 List
- 预览弹多个 → 同步 `_previewLock` 防重入
- 首次加载重复触发 → 同步 `_statusLoaded` / `_smsLoaded` 标志
- QCI 重复显示 → 底部 QoS 分区去掉 QCI 行
- 会话详情 render 阶段 setState → 改为错误提示页
- 设备名硬编码 F50 → 动态获取 `model_name`
- RSRQ 图标无效 → 改为 `gauge.medium`

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