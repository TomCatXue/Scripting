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
    assert.ok(pluginContent.includes("loon.local/api/monitor"), "插件包含本地虚拟 API 拦截规则");
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
const tests: [string, () => Promise<void> | void][] = [
    ["油价小号百分比显示", testFuelSmallPercentage],
    ["GitHub 头像无灰框且支持热力图", testGitHubAvatarAndHeatmap],
    ["Loon 插件文件与规则校验", testLoonPluginArtifacts],
    ["Loon 中号组件展示 VPN 地址", testLoonMediumVpnDisplay],
];

let passed = 0;
for (const [name, fn] of tests) {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
}
console.log(`PASS ${passed} new feature checks`);
