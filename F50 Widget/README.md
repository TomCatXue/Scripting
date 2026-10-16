# F50 Widget

ZTE F50 / U60 等随身 Wi-Fi（UFI）设备的网络状态监控**小组件** + **五标签应用**
（状态 / 短信 / 电话 / 插件 / 设置）。

## 设计原则：能力如实呈现，不造假

应用只展示设备真实返回的数据；设备不支持的能力一律显示「暂不支持」而不是补零或伪造。
通话能力取决于设备侧是否安装 UFI-TOOLS 完整版与面具模块（Magisk），应用进入电话页时会先探测，
探测不到则明确提示并给出重试，不会出现「假装拨通」的界面。

## 功能概览

### 小组件（Small / Medium / Large）
- 今日/本月流量、信号、电池、CPU、内存、Wi-Fi 设备数
- 实时上下行速率展示与动态着色
- 套餐流量进度条（变色）与重置倒计时
- 信号质量评级（极佳/良好/一般/较差）
- QoS 指标（QCI + 上下行 AMBR）
- 点击刷新（AppIntent）与离线缓存容错

### 状态页（标签 1）
- 设备概览：设备名、在线状态、信号格（图标 + 数值 + 文字三通道）
- SIM 卡：运营商、信号质量、RSRP/RSRQ/SNR、ICCID（脱敏可复制）、SIM 号码（脱敏）、PIN 锁
- 实时速率：上下行数值 + 采样曲线（Charts，双区分色）
- 流量统计：今日/本月/套餐用量环形仪表/重置倒计时
- 设备运行状态：芯片温度与内存环形仪表（含正常/偏高/过热文字）、CPU、网络制式、频段、电量、ZTE 登录态
- Wi-Fi：SSID、频段、已连接数量、客户端列表（IP/MAC 脱敏）
- 快捷操作：刷新、发送短信、打电话、插件中心、重启设备（二次确认，走真实 REBOOT_DEVICE）

### 短信页（标签 2）
- 会话列表：按号码分组，未读标记，验证码高亮
- 会话详情：左右气泡（收到靠左 / 发出靠右）、日期与状态、一键复制验证码
- 写短信：号码 + 内容，发送前二次确认，失败给出明确原因

### 电话页（标签 3）
- 进入即探测 `/api/volte_status`；不可用时显示「当前设备未提供通话接口」并给出重试
- 拨号盘（0-9 / * / # / 删除 / 拨打，长按 0 输入 +）、最近通话（本机记录）
- 通话中界面：来电/拨出/通话中/保持状态、计时、接听与挂断
- AT 透传：`ATD<号码>;` / `ATA` / `ATH` / `AT+CLCC`（3 秒轮询，空闲即停）
- 音频路由由设备侧面具模块负责，应用不做音频处理

### 插件页（标签 4）
- 数据源为设备侧 UFI-TOOLS 自定义头插件片段（`/api/get_custom_head`）
- 列表：图标、名称、启用/禁用标签、内容摘要
- 详情：完整片段、启用/停用、复制、删除（写入前二次确认）
- 空状态与错误态明确，不内置示例插件冒充真实数据

### 设置页（标签 5）
- 外观：跟随系统/浅色/深色、强调色预设、完整动画开关
- 设备与后台连接：UFI 地址、保存、测试连接、预览小组件
- 凭据：UFI-TOOLS 密码与 ZTE 后台密码分组，默认密文、可切换显隐
- 通话能力：VoLTE / VoNR 开关（不可用时如实提示）
- 数据与设备：重置应用配置（二次确认）
- 隐私与安全、关于

## 技术架构
- **双端口轮询**：ZTE 80 端口匿名读取 + UFI 2333 端口签名读取，数据合并
- **候选 Token 轮询**：SHA256 多变体 + admin 免底，遇 401 自动切换
- **多策略登录**：zreq 二进制 > POST 登录 > GET-only 兑底
- **通话通道**：UFI-TOOLS 完整版 `/api/AT` 透传（ATD / ATA / ATH / AT+CLCC）
- **插件通道**：`/api/get_custom_head` + `/api/set_custom_head`（KANO_PLUGIN 片段）
- **设计系统**：`theme.ts`（间距/圆角/字号/语义色 token）+ `ui.tsx`（卡片/数据行/环形仪表/状态胶囊/空-错-载态）

## 订阅

```
https://github.com/TomCatXue/Scripting/tree/main/F50%20Widget
```

## 文件

| 文件 | 说明 |
|---|---|
| `script.json` | 项目配置（含订阅 `remoteResource`） |
| `index.tsx` | 入口（TabView 五标签） |
| `status_view.tsx` | 状态页（设备 / SIM / 速率曲线 / 流量 / 硬件 / Wi-Fi / 快捷操作） |
| `sms_view.tsx` | 短信页（会话列表 / 聊天详情 / 写短信） |
| `phone_view.tsx` | 电话页（拨号盘 / 最近通话 / 通话中） |
| `plugins_view.tsx` | 插件页（列表 / 详情 / 启停 / 删除） |
| `settings_view.tsx` | 设置页（外观 / 连接 / 凭据 / 通话 / 数据 / 隐私 / 关于） |
| `theme.ts` | 设计 token 与外观偏好 |
| `ui.tsx` | 共享 UI 组件 |
| `call.ts` | 通话 AT 指令构造与 `AT+CLCC` 解析 |
| `plugins.ts` | 插件片段解析 / 序列化 / 启停 / 删除 |
| `widget.tsx` | 小组件 UI（Small/Medium/Large，含速率/进度条/信号评级/QoS） |
| `widget_data.ts` | 数据组装与缓存（双端口合并、速率/流量限额/信号评级/QoS） |
| `api.ts` | UFI-TOOLS / ZTE 网络层（双端口轮询、签名、登录、SMS 收发、QoS、验证码提取） |
| `app_intents.tsx` | 点击刷新 AppIntent |
| `icons/` | 脚本图标（UFI-TOOLS 官方图标，透明背景） |

## 测试

```bash
node --import "./F50 Widget/tests/register.mjs" "./F50 Widget/tests/regression.test.ts"
node --import "./F50 Widget/tests/register.mjs" "./F50 Widget/tests/call.test.ts"
node --import "./F50 Widget/tests/register.mjs" "./F50 Widget/tests/plugins.test.ts"
node --import "./F50 Widget/tests/register.mjs" "./F50 Widget/tests/api_call.test.ts"
node --import "./F50 Widget/tests/register.mjs" "./F50 Widget/tests/theme.test.ts"
node --import "./F50 Widget/tests/register.mjs" "./F50 Widget/tests/ui.test.ts"
node --import "./F50 Widget/tests/register.mjs" "./F50 Widget/tests/phone_view.test.ts"
node --import "./F50 Widget/tests/register.mjs" "./F50 Widget/tests/plugins_view.test.ts"
node --import "./F50 Widget/tests/register.mjs" "./F50 Widget/tests/views.test.ts"
node --import "./F50 Widget/tests/register.mjs" "./F50 Widget/tests/data_sim.test.ts"
node --import "./F50 Widget/tests/register.mjs" "./F50 Widget/tests/index.test.ts"
```

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

### 2026-10-16：五标签重构（4.0.0）

**新增**
- **电话页**：能力探测 + 拨号盘 + 最近通话 + 通话中三态；AT 透传（`ATD`/`ATA`/`ATH`/`AT+CLCC`），3 秒轮询且空闲即停
- **插件页**：设备侧 UFI-TOOLS 插件片段（解析/启停/删除/复制），无数据时不伪造
- **状态页重做**：SIM 卡区块（ICCID / 号码 / PIN，脱敏）、实时速率双曲线、环形温度与内存仪表、Wi-Fi 客户端列表、快捷操作（含真实 `REBOOT_DEVICE` 重启）
- **设置页重做**：外观（模式/强调色/动画强度）、UFI 与 ZTE 凭据分组、VoLTE/VoNR 开关、隐私与关于
- **设计系统**：`theme.ts` token + `ui.tsx` 共享组件；所有页面对齐统一间距/圆角/字号/语义色

**修复与加固**
- 短号（如 10086）不再被错误脱敏为 `100****0086`
- 重启改用真实 goform `REBOOT_DEVICE`（此前误用未经验证的 AT 指令）
- 设备不支持的通话、套餐速率、客户端列表一律显示「暂不支持」而非补零

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
