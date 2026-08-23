# Scripting Scripts

为 iOS [Scripting App](https://scripting.today) 开发的脚本集合仓库，每个脚本独立文件夹，可直接**订阅下载**。

## 脚本列表

| 脚本 | 说明 | 尺寸 | 订阅链接 |
|---|---|---|---|
| [UfiPeek](./UfiPeek) | ZTE F50（UFI-TOOLS）网络状态小组件：今日/本月流量、信号、电池、CPU、内存、Wi-Fi，支持点击刷新与离线缓存 | Small / Medium / Large | `https://github.com/TomCatXue/Scripting/tree/main/UfiPeek` |

## 订阅方式

在 Scripting App 中粘贴对应脚本的 GitHub 文件夹链接（上表最后一列）即可下载，之后按 `script.json` 中的 `remoteResource` 自动更新。

## 目录结构

```
Scripting/
├── README.md          # 本文件
└── UfiPeek/           # 脚本 1：UfiPeek
    ├── script.json    # 项目配置（含订阅 remoteResource）
    ├── index.tsx      # 入口（预览）
    ├── widget.tsx     # 小组件 UI（Small / Medium / Large）
    ├── widget_data.ts # 数据组装与缓存
    ├── api.ts         # UFI-TOOLS / ZTE 网络层
    ├── app_intents.tsx# 点击刷新 AppIntent
    └── README.md      # 脚本配置说明
```

## License

仅供学习参考。
