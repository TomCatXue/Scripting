# Weibo 微博热搜

为 iOS [Scripting App](https://scripting.today) 开发的微博热搜小组件与热搜应用。

## 功能

**小组件（Small / Medium / Large）**

- 实时微博热搜榜：前 3 名红色高亮，其余金色角标
- 条目自动带热度角标图（热 / 新 / 沸 等）
- 右上角显示时钟 + 版本标记（桌面上能看到 `v7` 说明加载的是最新代码）
- 点击条目 → 按设置跳转（微博国际版深链 / H5 网页兜底）
- 点击右下角 Logo → 打开热搜总榜
- 可自定义字号、行距、配色、背景、图标染色模式

**App 内**

- 热搜列表（支持下拉刷新）
- WebView 搜索页（注入深色样式，适配夜间模式）
- 设置页（客户端 / 排版 / 配色 / 渲染模式）

## 订阅

在 Scripting App 中粘贴以下链接订阅：

```
https://github.com/TomCatXue/Scripting/tree/main/Weibo
```

## 设置项

`store/settings.ts` 中的可配置项（设置页可改）：

| 项 | 说明 |
|---|---|
| `client` | 跳转客户端：`h5`（网页版）/ `international`（微博国际版） |
| `fontSize` / `gap` / `logoSize` | 排版：字号 / 行距 / Logo 尺寸 |
| `color` / `timeColor` / `background` | 配色：字体 / 时间 / 背景 |
| `renderingMode` | 图标染色模式（accented / desaturated / accentedDesaturated / fullColor） |

## 数据来源

热搜接口：`https://weibointl.api.weibo.cn/portal.php?ct=feed&a=search_hot`
> 旧接口 `a=search_topic` 已返回空数据，实时数据已迁移至 `a=search_hot`。

## 深链方案

点击小组件条目 → 通过 `Script.createRunURLScheme` 唤起本脚本（带 `action=open` 参数）→ 主 App 环境根据 `client` 设置选择跳转方式：

- `international`：`weibointernational://searchall?q=…` 深链唤起微博国际版
- `h5` / 深链失败：`Safari.openURL` 打开 `m.weibo.cn` 网页版兜底

AppIntent（`app_intents.tsx`）提供相同的跳转逻辑，并带失败回退与 `Widget.reloadAll()`。

## 作者

原作者 Jackie（[Honye@github.com](mailto:Honye@github.com)），本仓库仅作托管与维护。
