# Scripting Scripts

为 iOS [Scripting App](https://scripting.today) 开发的脚本集合仓库，每个脚本独立文件夹，可直接**订阅下载**。

## 脚本列表

| 脚本 | 说明 | 尺寸 | 订阅链接 |
|---|---|---|---|
| [UfiPeek](./UfiPeek) | ZTE F50（UFI-TOOLS）网络状态小组件：今日/本月流量、信号、电池、CPU、内存、Wi-Fi；应用内置设置页（URL/密码配置、测试连接），支持点击刷新与离线缓存 | Small / Medium / Large | `https://github.com/TomCatXue/Scripting/tree/main/UfiPeek` |

## 目录结构

```
Scripting/
├── README.md          # 本文件
└── UfiPeek/           # 脚本 1：UfiPeek
    ├── script.json    # 项目配置（含订阅 remoteResource）
    ├── index.tsx      # 入口（设置页：配置 URL/密码、测试连接、预览）
    ├── widget.tsx     # 小组件 UI（Small / Medium / Large）
    ├── widget_data.ts # 数据组装与缓存
    ├── api.ts         # UFI-TOOLS / ZTE 网络层
    ├── app_intents.tsx# 点击刷新 AppIntent
    └── README.md      # 脚本配置说明
```

## License

仅供学习参考。
