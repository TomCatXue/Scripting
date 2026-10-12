// Loon 监控中号小组件数据逻辑与回归测试
// 运行：node --import "./MutePanel/tests/register.mjs" "./MutePanel/tests/loon.test.ts"
import assert from "node:assert/strict";
import { installGlobals, resetGlobals } from "./globals.ts";
import { setMockFetch } from "./scripting.mock.ts";

installGlobals();

const data = await import("../data.ts");
const types = await import("../types.ts");

function mockResponse(body: any, headersRecord: Record<string, string> = {}, status = 200): any {
    const headersMap = new Map<string, string>(Object.entries(headersRecord));
    return {
        status,
        ok: status >= 200 && status < 300,
        text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
        json: async () => (typeof body === "string" ? JSON.parse(body) : body),
        headers: {
            get: (k: string) => headersMap.get(k.toLowerCase()) || headersRecord[k] || null,
            ...headersRecord,
        },
    };
}

// ── 1. 配置项读写与探测 ─────────────────────────────────────────
function testLoonConfigAccessors(): void {
    resetGlobals();
    assert.equal(data.loadLoonUrl(), "http://loon.box/api/monitor", "默认 Loon URL 为虚拟直连地址");
    assert.equal(data.hasLoonConfigured(), true, "默认开启直连，hasLoonConfigured 为 true");

    data.saveLoonUrl("https://sub.example.com/api/v1/client/subscribe?token=xyz");
    assert.equal(
        data.loadLoonUrl(),
        "https://sub.example.com/api/v1/client/subscribe?token=xyz",
        "保存并读取 Loon 链接"
    );
    assert.equal(data.hasLoonConfigured(), true, "保存后 hasLoonConfigured 为 true");
}

// ── 2. 流量字节单位换算 ─────────────────────────────────────────
function testFormatBytes(): void {
    assert.equal(data.formatBytes(0), "0 B");
    assert.equal(data.formatBytes(512), "512 B");
    assert.equal(data.formatBytes(1024), "1 KB");
    assert.equal(data.formatBytes(1536), "1.5 KB");
    assert.equal(data.formatBytes(1024 * 1024 * 250), "250 MB");
    assert.equal(data.formatBytes(1024 * 1024 * 1024 * 5.8), "5.8 GB");
    assert.equal(data.formatBytes(1024 * 1024 * 1024 * 102.6), "102.6 GB");
    assert.equal(data.formatBytes(1024 * 1024 * 1024 * 500), "500 GB");
    assert.equal(data.formatBytes(1024 * 1024 * 1024 * 1024 * 1.5), "1.5 TB");
}

// ── 3. subscription-userinfo 响应头解析 ─────────────────────────
function testParseSubscriptionUserInfo(): void {
    const header = "upload=6228574208; download=110166278144; total=536870912000; expire=1735689600";
    const parsed = data.parseSubscriptionUserInfo(header);
    assert.ok(parsed, "解析 subscription-userinfo 成功");
    assert.equal(parsed?.upload, 6228574208);
    assert.equal(parsed?.download, 110166278144);
    assert.equal(parsed?.total, 536870912000);
    assert.equal(parsed?.expire, 1735689600);
}

// ── 4. 真实订阅头响应抓取与字段映射 ─────────────────────────────
async function testFetchLoonSubscription(): Promise<void> {
    resetGlobals();
    const subUrl = "https://sub.example.com/subscribe";
    data.saveLoonUrl(subUrl);

    // upload ~ 5.8 GB, download ~ 102.6 GB, total = 500 GB
    const upBytes = Math.round(5.8 * 1024 * 1024 * 1024);
    const downBytes = Math.round(102.6 * 1024 * 1024 * 1024);
    const totBytes = 500 * 1024 * 1024 * 1024;
    // 设定 24 天后过期
    const expireSec = Math.floor((Date.now() + 24 * 86400 * 1000) / 1000);

    setMockFetch(async (url: string) => {
        assert.equal(url, subUrl);
        return mockResponse("PROXIES...", {
            "subscription-userinfo": `upload=${upBytes}; download=${downBytes}; total=${totBytes}; expire=${expireSec}`,
        });
    });

    const res = await data.fetchLoonData(subUrl, true);
    assert.equal(res.serviceId, "loon");
    assert.equal(res.uploadText, "5.8 GB", "上传流量 5.8 GB");
    assert.equal(res.downloadText, "102.6 GB", "下载流量 102.6 GB");
    assert.equal(res.totalText, "500 GB", "总额 500 GB");
    assert.equal(res.remainingText, "391.6 GB", "剩余流量 391.6 GB (500 - 102.6 - 5.8)");
    assert.ok(res.resetDaysText.includes("24 天后重置"), `重置文案包含 24 天: ${res.resetDaysText}`);
}

// ── 5. OpenAPI JSON 格式解析（运行模式、策略组等）────────────────
async function testFetchLoonOpenApi(): Promise<void> {
    resetGlobals();
    const apiUrl = "http://127.0.0.1:9090/api/v1/config";
    data.saveLoonUrl(apiUrl);

    // Loon 文档中的 config 结构
    const openApiBody = {
        running_model: 1, // 0: 直连, 1: 分流, 2: 代理
        all_policy_groups: ["节点选择", "国外媒体", "国内媒体", "苹果服务", "广告拦截", "Final"],
        delay: 245,
        version: "3.2.1",
    };

    setMockFetch(async () => {
        return mockResponse(openApiBody);
    });

    const res = await data.fetchLoonData(apiUrl, true);
    assert.equal(res.runningMode, "规则分流", "running_model: 1 映射为规则分流");
    assert.equal(res.policyGroupCount, 6, "策略组数量正确提取");
    assert.equal(res.delayMs, 245, "延迟提取成功");
    assert.equal(res.version, "3.2.1", "版本提取成功");
}

// ── 6. 异常降级兜底：无缓存时必须是「空状态」而不是内置示例数据 ──
async function testFallbackOnError(): Promise<void> {
    resetGlobals();
    setMockFetch(async () => {
        throw new Error("Loon API offline");
    });

    const fallback = await data.fetchLoonData("http://unreachable:9090", true);
    assert.ok(fallback, "离线时返回兜底数据");
    assert.equal(fallback.serviceId, "loon");
    // 首次拉取失败且没有任何缓存 → 标记为未配置，卡片显示空状态提示。
    // 早期实现会返回内置示例流量（5.8 GB / 102.6 GB），看起来像已接入数据。
    assert.equal(fallback.configured, false, "无缓存失败时标记未配置");
    assert.ok(
        String(fallback.errorText || "").includes("失败"),
        `errorText 应说明获取失败，实际：${fallback.errorText}`
    );
}

// ── 7. 未配置时不得展示内置示例流量 ────────────────────────────
async function testUnconfiguredShowsEmptyState(): Promise<void> {
    resetGlobals();
    const d = await data.fetchLoonData("", true);
    assert.equal(d.configured, false, "未配置 Loon 时标记未配置");
    assert.ok(
        String(d.errorText || "").includes("尚未配置"),
        `未配置提示应明确，实际：${d.errorText}`
    );
}

// ── 执行 ───────────────────────────────────────────────────────
const tests: [string, () => Promise<void> | void][] = [
    ["配置项读写与探测", testLoonConfigAccessors],
    ["流量字节单位换算", testFormatBytes],
    ["subscription-userinfo 响应头解析", testParseSubscriptionUserInfo],
    ["真实订阅头响应抓取与字段映射", testFetchLoonSubscription],
    ["OpenAPI JSON 格式解析", testFetchLoonOpenApi],
    ["异常降级兜底", testFallbackOnError],
    ["未配置显示空状态", testUnconfiguredShowsEmptyState],
];

let passed = 0;
for (const [name, fn] of tests) {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
}
console.log(`PASS ${passed} loon checks`);
