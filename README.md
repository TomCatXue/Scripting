# Scripting Scripts

为 iOS [Scripting App](https://scripting.today) 开发的脚本集合仓库，每个脚本独立文件夹，可直接**订阅下载**。

## 脚本列表

| 脚本 | 说明 | 尺寸 | 订阅链接 |
|---|---|---|---|
| [F50 Widget](./F50%20Widget) | ZTE F50（UFI-TOOLS）网络状态小组件 + 三标签应用（状态 / 短信 / 设置）：双端口轮询（80 匿名 + 2333 签名）+ 候选 Token 轮询；实时上下行速率、套餐流量进度条与重置倒计时、信号质量评级、QoS 指标；短信会话列表、验证码提取与一键复制、写短信；小组件支持 Small / Medium / Large 三种尺寸、点击刷新与离线缓存 | Small / Medium / Large | `https://github.com/TomCatXue/Scripting/tree/main/F50%20Widget` |

## 目录结构

```
Scripting/
├── README.md          # 本文件
├── WIDGET_GUIDE.md    # 小组件开发指南（创建/调试/审查）
└── F50 Widget/        # 脚本 1：F50 Widget
    ├── script.json    # 项目配置（含订阅 remoteResource）
    ├── index.tsx      # 入口（TabView 三标签：状态页/短信页/设置页）
    ├── widget.tsx     # 小组件 UI（Small / Medium / Large，含速率/进度条/信号评级/QoS）
    ├── widget_data.ts # 数据组装与缓存（双端口合并、速率/流量限额/信号评级/QoS）
    ├── api.ts         # UFI-TOOLS / ZTE 网络层（双端口轮询、签名、登录、SMS 收发、QoS、验证码提取）
    ├── app_intents.tsx# 点击刷新 AppIntent
    ├── icons/         # 脚本图标（透明 PNG，多尺寸）
    └── README.md      # 脚本配置说明
```

## License

仅供学习参考。
