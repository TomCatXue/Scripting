// 新功能与修复回归测试：油价百分比、GitHub 灰框与热力图、Loon 插件与 VPN 地址
// 运行：node --import "./MutePanel/tests/register.mjs" "./MutePanel/tests/new_features.test.ts"
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installGlobals, resetGlobals } from "./globals.ts";

installGlobals();

const data = await import("../data.ts");
const types = await import("../types.ts");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cardsSrc = fs.readFileSync(path.resolve(__dirname, "../cards.tsx"), "utf-8");

// ── 1. 油价小号组件百分比显示 ──────────────────────────────────
async function testFuelSmallPercentage(): Promise<void> {
    resetGlobals();
    assert.ok(types.DEFAULT_FUEL.changeRateText, "DEFAULT_FUEL 具有 changeRateText");
    assert.equal(types.DEFAULT_FUEL.changeRateText, "-1.52%");

    assert.ok(
        cardsSrc.includes("data.changeRateText"),
        "FuelPriceSmallCard 优先读取 data.changeRateText"
    );
}

// ── 2. GitHub 监控：头像无灰色方框，且支持热力图切换 ───────────
async function testGitHubAvatarAndHeatmap(): Promise<void> {
    resetGlobals();
    const ghCardSlice = cardsSrc.slice(cardsSrc.indexOf("export function GitHubMediumCard"));
    assert.ok(
        !ghCardSlice.includes("border={{ style: THEME.border as any, width: 1.5 }}"),
        "GitHubMediumCard 头像不再设置外层矩形 border，彻底消除灰色方框"
    );

    assert.ok(
        cardsSrc.includes("isHeatmap ?"),
        "GitHubMediumCard 包含热力图渲染分支"
    );
    assert.ok(
        cardsSrc.includes("getGithubContributionColor"),
        "GitHubMediumCard 包含热力图色阶映射"
    );
}

// ── 3. Loon 监控：插件规则必须真的能拦到请求 ───────────────────
// 回归（真机 HAR 129_1791786645054.har 证据）：
//   GET http://loon.box/api/monitor -> status 0
//   _loon.rule = "FINAL,兜底策略"，_loon.script = []
// 插件里的 [Host]/[Rule]/[Script] 一条都没命中，请求被丢给远端节点后
// TLS EOF。因此这里不满足于「文件存在」，而是校验拦截链路本身。
function testLoonPluginArtifacts(): void {
    const pluginPath = "D:/File/C++/MyCookieCenter/loon/LoonMonitor.plugin";
    const scriptPath = "D:/File/C++/MyCookieCenter/scripts/tools/loon/loon_monitor.js";

    assert.ok(fs.existsSync(pluginPath), "LoonMonitor.plugin 文件存在");
    assert.ok(fs.existsSync(scriptPath), "loon_monitor.js 脚本文件存在");

    const pluginContent = fs.readFileSync(pluginPath, "utf-8");
    assert.ok(
        /^\[Host\]$/m.test(pluginContent),
        "插件声明 [Host]，虚拟域名才能在本地解析，否则请求会在 DNS 阶段就失败"
    );
    assert.ok(
        /loon\.box\s*=\s*127\.0\.0\.1/.test(pluginContent),
        "loon.box 本地解析到 127.0.0.1"
    );
    assert.ok(
        /^\[Script\]$/m.test(pluginContent),
        "插件声明 [Script] 段"
    );
    assert.ok(
        pluginContent.includes("request if ${url} ~=") &&
            pluginContent.includes("then script("),
        "使用与本仓库其它已验证插件一致的 request-if-then-script 拦截语法"
    );
    assert.ok(
        /loon\\?\.\(box\|local\)/.test(pluginContent),
        "拦截正则同时覆盖 loon.box 与 loon.local（兼容历史版本）"
    );
    assert.ok(
        /^DOMAIN,loon\.box,DIRECT$/m.test(pluginContent) &&
            /^DOMAIN,loon\.local,DIRECT$/m.test(pluginContent),
        "两个虚拟域名都显式 DIRECT，脚本未命中时也不会被丢到远端节点"
    );
    assert.ok(
        pluginContent.includes("[?&]token="),
        "插件包含订阅流量捕获规则"
    );
    assert.ok(
        pluginContent.includes("(subscription|subscribe)"),
        "订阅捕获按路径段收窄匹配，避免每条响应都触发脚本"
    );
    assert.ok(
        !/script-path=https:\/\/raw\.githubusercontent\.com/.test(pluginContent),
        "脚本路径不得使用 raw.githubusercontent（国内直连会被阻断）"
    );
    assert.ok(
        pluginContent.includes("cdn.jsdelivr.net"),
        "脚本路径走 jsDelivr 镜像，保证手机能下载到脚本"
    );

    const scriptContent = fs.readFileSync(scriptPath, "utf-8");
    assert.ok(scriptContent.includes("serveMonitorData"), "脚本包含本地虚拟 API 响应函数");
    assert.ok(scriptContent.includes("captureSubscription"), "脚本包含订阅捕获函数");
    assert.ok(scriptContent.includes("vpnIp"), "脚本包含 VPN 出口 IP 探测与返回");
    assert.ok(
        /timeout:\s*IP_PROBE_TIMEOUT_MS/.test(scriptContent) &&
            /IP_PROBE_TIMEOUT_MS\s*=\s*\d{3,}/.test(scriptContent),
        "出口 IP 探测超时必须是毫秒级常量（Loon 的 $httpClient.timeout 单位是 ms）"
    );
    assert.ok(
        scriptContent.includes("$config.getSelectedPolicy"),
        "当前节点取自 Loon 实际选中的策略，而不是写死文案"
    );
}

// ── 4. Loon 中号小组件：支持 VPN 地址与节点展示 ───────────────
async function testLoonMediumVpnDisplay(): Promise<void> {
    resetGlobals();
    const mockLoon = {
        ...types.DEFAULT_LOON,
        vpnIp: "103.149.92.18",
        vpnLocation: "香港 · HKBN",
        nodeName: "香港 01 IPLC",
        configured: true,
    };

    assert.equal(mockLoon.vpnIp, "103.149.92.18");
    assert.equal(mockLoon.vpnLocation, "香港 · HKBN");

    const loonCardSlice = cardsSrc.slice(cardsSrc.indexOf("export function LoonMediumCard"));
    assert.ok(
        loonCardSlice.includes("data.vpnIp"),
        "LoonMediumCard 包含 vpnIp 渲染"
    );
    assert.ok(
        loonCardSlice.includes("VPN 节点"),
        "LoonMediumCard 次级栏展示 VPN 节点信息"
    );
}

// ── 执行 ───────────────────────────────────────────────────────

// ── 5. 油价模块：右上角调价标签可见性与价格字号对齐 ─────────────
// 回归：v1.3.6 把调价标签和标题放在同一行且不给布局优先级，SwiftUI 先把
// 标签压到接近 0 宽 → 用户反馈「调价信息完全不可见」。
async function testFuelSmallTagAlignment(): Promise<void> {
    resetGlobals();
    assert.ok(
        cardsSrc.includes('tagText={data.cleanDateText || "近期调价"}'),
        "FuelPriceSmallCard 调价提示通过 tagText 传给模板"
    );
    const fuelCardSlice = cardsSrc.slice(
        cardsSrc.indexOf("export function FuelPriceSmallCard"),
        cardsSrc.indexOf("export function FuelPriceMediumCard")
    );
    assert.ok(
        !fuelCardSlice.includes("footnote="),
        "FuelPriceSmallCard 底部移除 footnote，保证价格与黄金模块对齐"
    );

    const tpl = fs.readFileSync(path.resolve(__dirname, "../templates.tsx"), "utf-8");
    const trend = tpl.slice(
        tpl.indexOf("export function TrendSmallTemplate"),
        tpl.indexOf("// 2. 小号 AI 用量看板模板")
    );
    assert.ok(
        trend.includes("layoutPriority={1}"),
        "调价胶囊必须带布局优先级，否则会被标题挤到不可见"
    );
    assert.ok(
        trend.includes('clipShape="capsule"'),
        "调价标签使用真正的胶囊形状"
    );
    assert.ok(
        !trend.includes("widgetBackground={{ light: \"rgba(0,0,0,0.05)\""),
        "调价胶囊不再用会被 accented 模式隐藏的 widgetBackground"
    );

    // 油价与金价共用同一主数值字号与固定列宽，避免位数差异导致视觉大小不一
    assert.ok(
        tpl.includes("export const PRICE_FONT_SIZE"),
        "主数值字号集中定义，油价与金价共用"
    );
    assert.ok(
        trend.includes("frame={{ width: PRICE_COLUMN_WIDTH"),
        "主数值使用固定列宽，保证两张卡片数字实际渲染尺寸一致"
    );
}

// ── 6. GitHub 中号监控：恢复整洁版式 + 仓库列表对齐 ───────────
// 回归：v1.3.6 把左侧字号整体放大并给顶栏加固定行高，导致版式拥挤混乱。
// 现在恢复 v1.3.4 的清爽基线，只保留「仓库列表等距 + 数字列右对齐」这类
// 不改变整体密度的定点优化。
async function testGitHubMediumRefinements(): Promise<void> {
    resetGlobals();
    const ghCardSlice = cardsSrc.slice(
        cardsSrc.indexOf("export function GitHubMediumCard"),
        cardsSrc.indexOf("export function LoonMediumCard")
    );
    assert.ok(
        ghCardSlice.includes('alignment="center"'),
        "GitHubMediumCard 恢复整体居中对齐（不再强制顶端对齐导致视觉割裂）"
    );
    assert.ok(
        ghCardSlice.includes("star.fill") && ghCardSlice.includes("arrow.triangle.branch"),
        "仓库列表统一使用 SF Symbols 图标（替代 ★ / ⑂ 文本符号）"
    );
    assert.ok(
        ghCardSlice.includes('height: 17'),
        "7 行仓库固定等高，标签基线整齐"
    );
    assert.ok(
        ghCardSlice.includes("layoutPriority={1}"),
        "仓库名拥有布局优先级，长名字不会把 Stars/Fork 数字挤出可视区"
    );
    assert.ok(
        ghCardSlice.includes("CompactChip"),
        "热力图切换使用统一的 CompactChip 胶囊组件"
    );
}

// ── 7. WorkBuddy 小号组件：账号展示「已签/总数」 ──────────────
async function testWorkBuddySignedRatio(): Promise<void> {
    resetGlobals();
    const d = await import("../data.ts");
    assert.ok(
        typeof d.refreshWbDirectData === "function",
        "WorkBuddy 数据服务可调用"
    );
    const dSrc = fs.readFileSync(path.resolve(__dirname, "../data.ts"), "utf-8");
    assert.ok(
        dSrc.includes("${Math.max(0, Math.floor(okCount))}/${Math.max(0, Math.floor(totalCount))}"),
        "WorkBuddy 账号格式为「已签/账号总数」"
    );
}

// ── 8. 胶囊视觉统一：全仓只保留一种胶囊几何 ────────────────────
// 用户反馈「胶囊元素样式变丑」：此前各处圆角半径与实际高度不匹配
// （约 17pt 高的色块只给 4~5pt 圆角），看起来是歪斜色块而不是胶囊。
async function testCapsuleConsistency(): Promise<void> {
    resetGlobals();
    const tpl = fs.readFileSync(path.resolve(__dirname, "../templates.tsx"), "utf-8");
    const card = fs.readFileSync(path.resolve(__dirname, "../cards.tsx"), "utf-8");
    const theme = fs.readFileSync(path.resolve(__dirname, "../theme.ts"), "utf-8");

    assert.ok(
        tpl.includes('clipShape="capsule"'),
        "行情模板的品类/徽章标签使用真胶囊形状"
    );
    assert.ok(
        !tpl.includes('clipShape={{ type: "rect", cornerRadius: 5 }}'),
        "品类标签不再用 5pt 圆角冒充胶囊"
    );
    assert.ok(
        card.includes("export function CompactChip"),
        "提供统一的 CompactChip 胶囊组件"
    );
    assert.ok(
        card.includes('clipShape="capsule"'),
        "CompactChip 使用真胶囊形状"
    );
    assert.ok(
        card.includes("softTint"),
        "胶囊底色由 softTint 按主题派生，避免写死的高饱和色块"
    );
    assert.ok(
        theme.includes("export function softTint"),
        "theme 暴露 softTint 供各卡片复用"
    );
}

// ── 9. Loon 设置页必须能区分「接通」与「失败」 ──────────────────
// 回归：refreshLoonData 永远返回对象，早期用 `if (res)` 判断，插件没接通
// 时也弹「获取成功」，用户因此无法判断插件到底有没有工作。
async function testLoonSettingsHonesty(): Promise<void> {
    resetGlobals();
    const idx = fs.readFileSync(path.resolve(__dirname, "../index.tsx"), "utf-8");
    // 精确切出 configureLoonSettings 的函数体（下一个顶层声明为边界），
    // 避免把其它服务的 `if (res)` 误判为本函数的问题。
    const start = idx.indexOf("async function configureLoonSettings");
    assert.ok(start >= 0, "找到 configureLoonSettings");
    const rest = idx.slice(start);
    const endRel = rest.indexOf("\n/** BENTO 模块的展示名称 */");
    const body = endRel > 0 ? rest.slice(0, endRel) : rest;

    assert.ok(
        body.includes("res.configured") && body.includes("!res.errorText"),
        "测试连接要求 configured 且无 errorText，缓存回退不会被误报为成功"
    );
    assert.ok(
        !/if \(res\) \{/.test(body),
        "不得再用 `if (res)` 判定连接成功"
    );
    assert.ok(
        body.includes("res.errorText"),
        "失败时把真实原因回显给用户"
    );
    assert.ok(
        body.includes("LoonMonitor.plugin"),
        "直连模式提示里给出可直接导入的插件地址"
    );
}

const tests: [string, () => Promise<void> | void][] = [
    ["油价小号百分比显示", testFuelSmallPercentage],
    ["GitHub 头像无灰框且支持热力图", testGitHubAvatarAndHeatmap],
    ["Loon 插件文件与规则校验", testLoonPluginArtifacts],
    ["Loon 中号组件展示 VPN 地址", testLoonMediumVpnDisplay],
    ["油价右上角调价与黄金对齐", testFuelSmallTagAlignment],
    ["GitHub 版式恢复与仓库列表对齐", testGitHubMediumRefinements],
    ["WorkBuddy 账号已签/总数比率", testWorkBuddySignedRatio],
    ["胶囊视觉统一", testCapsuleConsistency],
    ["Loon 设置页连接状态判定", testLoonSettingsHonesty],
];

let passed = 0;
for (const [name, fn] of tests) {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
}
console.log(`PASS ${passed} new feature checks`);
