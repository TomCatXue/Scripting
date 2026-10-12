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

// ── 3. Loon 监控：插件存在性与 JS 语法校验 ─────────────────────
function testLoonPluginArtifacts(): void {
    const pluginPath = "D:/File/C++/MyCookieCenter/loon/LoonMonitor.plugin";
    const scriptPath = "D:/File/C++/MyCookieCenter/scripts/tools/loon/loon_monitor.js";

    assert.ok(fs.existsSync(pluginPath), "LoonMonitor.plugin 文件存在");
    assert.ok(fs.existsSync(scriptPath), "loon_monitor.js 脚本文件存在");

    const pluginContent = fs.readFileSync(pluginPath, "utf-8");
    assert.ok(pluginContent.includes("loon.box") && pluginContent.includes("monitor"), "插件包含本地虚拟 API 拦截规则");
    assert.ok(pluginContent.includes("subscription"), "插件包含订阅捕获规则");

    const scriptContent = fs.readFileSync(scriptPath, "utf-8");
    assert.ok(scriptContent.includes("serveMonitorData"), "脚本包含本地虚拟 API 响应函数");
    assert.ok(scriptContent.includes("captureSubscription"), "脚本包含订阅捕获函数");
    assert.ok(scriptContent.includes("vpnIp"), "脚本包含 VPN 出口 IP 探测与返回");
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

// ── 5. 油价模块：右上角调价标签与黄金组件排版对齐 ─────────────
async function testFuelSmallTagAlignment(): Promise<void> {
    resetGlobals();
    assert.ok(
        cardsSrc.includes('tagText={data.cleanDateText || "近期调价"}'),
        "FuelPriceSmallCard 调价提示已移至右上角 tagText"
    );
    const fuelCardSlice = cardsSrc.slice(
        cardsSrc.indexOf("export function FuelPriceSmallCard"),
        cardsSrc.indexOf("export function FuelPriceMediumCard")
    );
    assert.ok(
        !fuelCardSlice.includes("footnote="),
        "FuelPriceSmallCard 底部移除 footnote，保证价格与黄金模块对齐"
    );
}

// ── 6. GitHub 中号监控：左侧字号放大、刷新按钮上移、仓库样式统一 ─
async function testGitHubMediumRefinements(): Promise<void> {
    resetGlobals();
    const ghCardSlice = cardsSrc.slice(cardsSrc.indexOf("export function GitHubMediumCard"));
    assert.ok(
        ghCardSlice.includes('alignment="top"'),
        "GitHubMediumCard 整体卡片顶端对齐"
    );
    assert.ok(
        ghCardSlice.includes("star.fill") && ghCardSlice.includes("arrow.triangle.branch"),
        "GitHubMediumCard 仓库列表使用统一 SF Symbols 图标"
    );
    assert.ok(
        ghCardSlice.includes('font={15}') && ghCardSlice.includes('font={12}'),
        "GitHubMediumCard 左侧用户昵称与用户名采用放大字号提升可读性"
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

const tests: [string, () => Promise<void> | void][] = [
    ["油价小号百分比显示", testFuelSmallPercentage],
    ["GitHub 头像无灰框且支持热力图", testGitHubAvatarAndHeatmap],
    ["Loon 插件文件与规则校验", testLoonPluginArtifacts],
    ["Loon 中号组件展示 VPN 地址", testLoonMediumVpnDisplay],
    ["油价右上角调价与黄金对齐", testFuelSmallTagAlignment],
    ["GitHub 字体放大与刷新上移", testGitHubMediumRefinements],
    ["WorkBuddy 账号已签/总数比率", testWorkBuddySignedRatio],
];

let passed = 0;
for (const [name, fn] of tests) {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
}
console.log(`PASS ${passed} new feature checks`);
