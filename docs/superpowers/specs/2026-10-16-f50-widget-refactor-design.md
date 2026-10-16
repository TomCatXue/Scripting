# F50 Widget → 五标签 iOS 原生风格重构 · 设计文档

日期：2026-10-16 ｜ 目标：`F50 Widget`（ZTE F50 / U60 等 UFI 设备的 iOS 管理脚本）

## 一、意图与目标

把现有「状态 / 短信 / 设置」三标签重构为 **状态 / 短信 / 电话 / 插件 / 设置** 五标签，
按 Apple HIG 重做视觉与交互，形成统一设计系统与可替换的能力适配层。

非目标：
- 不伪造设备能力（通话、套餐速率、插件状态一律以真实接口返回为准）。
- 不在 App 内做音频编解码与音频路由 —— 通话音频由设备侧面具模块（Magisk）负责。
- 不引入第三方 npm 依赖（沿用 Node 原生测试 + 脚本内自研工具函数）。

反目标：把界面做成 Web 后台风格、堆砌玻璃效果、用假数据填充空状态。

## 二、事实基线（本机实测 + 源码证据）

| 事实 | 证据 |
|---|---|
| 设备 80 端口 ZTE Web UI 可用，含短信，**无通话/语音接口** | 本机实测 `/webpages/index.html`、`login.html` 全文无 call/voice/dial 命中 |
| UFI-TOOLS 完整版（`http-server-version` 分支）提供 17 个模块 | GitHub tree 扫描，`app/src/main/java/com/minikano/f50_sms/modules/` |
| 通话通道 = `GET /api/AT?command=..&slot=..` AT 透传 | `atModule.kt`，底层 `sendat -n <slot> -c '<AT>'` |
| VoLTE / VoNR 开关 = `/api/volte_status`、`/api/vonr_status`（GET/POST） | `baseDeviceInfoModule.kt`；实现为 `AT+CAVIMS?` / `AT+CAVIMS=<0|1>` |
| 插件 = Web UI 自定义头片段，存 SharedPreferences | `pluginsModule.kt`：`/api/get_custom_head`、`/api/set_custom_head`、`/api/plugins_store` |
| 插件片段格式 | 前端 `main.js`：`<!-- [KANO_PLUGIN_START] name -->…<!-- [KANO_PLUGIN_END] name -->`，禁用态被 `<!-- [kano_disabled] … [kano_disabled] -->` 包裹 |
| 现有脚本已具备的通道 | `api.ts`：80 端口 goform（匿名/登录）、2333 签名（KanoSign）、`/api/root_shell`、`/api/user_shell` |
| 实机网络现状 | 本机 `192.168.0.1` 80/2333/5555 端口可达；2333 在本机环境下无 HTTP 应答（疑似本地代理干扰），故能力探测必须做失败降级 |

## 三、关键决策

1. **文件结构保持扁平**（与 `MutePanel` 一致）：Scripting 订阅按目录整体分发，子目录导入行为未验证 → 全部新文件放脚本根目录。
2. **能力探测优先于 UI 假设**：电话页进入时先探测 `/api/volte_status`。
   - 探测成功 → 电话页可用（拨号/接听/挂断/通话中 UI 全部真实调用）。
   - 探测失败 → 电话页展示「当前固件或面具模块未提供通话接口」+ 重试，拨号盘置灰，绝不显示"已拨通"。
3. **AT 指令集（本期固定）**：
   - 拨号 `ATD<号码>;`　接听 `ATA`　挂断 `ATH`（失败回退 `AT+CHUP`）
   - 通话状态轮询 `AT+CLCC`（解析 `+CLCC:` 行 → 方向/状态）
   - 静音/保持等高级控制本期不做（需厂商私有指令，未验证）。
4. **音频边界**：App 不触碰音频路由；通话中页面明确标注"音频由设备模块处理"。
5. **通话记录存本地**（Storage），因为设备接口未提供通话记录；UI 标注数据来源。
6. **主题系统**：语义色 token + 浅/深色双值（`{light, dark}`）+ 用户自定义强调色；`preferredColorScheme` 支持 跟随系统/浅色/深色。
7. **动画强度可配**：遵循"减少动态效果"诉求，提供 完整 / 精简 两档（App 内设置），精简档关闭曲线动画与数字过渡。
8. **空状态诚实**：所有卡片在设备不支持的字段上显示「暂不支持」而非编造数值。

## 四、模块边界

| 文件 | 职责 |
|---|---|
| `theme.ts` | 设计 token（间距/圆角/字号/语义色）、强调色读写、动画强度读写 |
| `api.ts` | 网络与协议：goform、KanoSign、AT、插件、SIM/Wi-Fi 字段（扩展） |
| `call.ts` | 通话状态机与 AT 解析（纯函数，可测） |
| `plugins.ts` | KANO_PLUGIN 片段解析/序列化/启停（纯函数，可测） |
| `ui.tsx` | 共用组件：卡片、数据行、环形/条形进度、状态标签、空-错-载态、确认弹窗 |
| `status_view.tsx` | 状态页（设备/SIM/速率/流量曲线/硬件/Wi-Fi 客户端/快捷操作） |
| `sms_view.tsx` | 短信页（会话列表 + 聊天详情 + 写短信） |
| `phone_view.tsx` | 电话页（最近通话/拨号盘/通话中） |
| `plugins_view.tsx` | 插件页（列表/详情/启停/导出） |
| `settings_view.tsx` | 设置页（外观/后台/凭据/数据/隐私/关于） |
| `index.tsx` | 五标签根视图 |
| `widget_data.ts` / `widget.tsx` | 保留并复用新字段（SIM、Wi-Fi 列表） |

## 五、识别风险

- 2333 在部分网络环境下不可达 → 所有页面必须有缓存与错误态。
- AT 指令在部分固件上返回格式不同 → 解析器容错（大小写、`+CLCC:` 变体、`OK/ERROR`）。
- 拨号会真实占用设备语音通道 → 必须二次确认，且明示"立即拨出"。
- 通话状态轮询频率过高会拖慢设备 → 通话中 3s、空闲不轮询。
