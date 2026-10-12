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

// ── 8. 双通道显式融合：Loon 插件规则分流 + 机场订阅流量 ─────────
async function testFetchLoonFusionDirect(): Promise<void> {
    resetGlobals();
    const pluginUrl = "http://127.0.0.1:9090/api/monitor";
    const subUrl = "https://sub.example.com/subscribe";

    const upBytes = Math.round(5.8 * 1024 * 1024 * 1024);
    const downBytes = Math.round(102.6 * 1024 * 1024 * 1024);
    const totBytes = 500 * 1024 * 1024 * 1024;
    const expireSec = Math.floor((Date.now() + 24 * 86400 * 1000) / 1000);

    const pluginBody = {
        running_model: 1,
        runningMode: "规则分流",
        all_policy_groups: ["节点选择", "国外媒体", "Final"],
        delay: 38,
        vpnIp: "103.152.220.1",
        vpnLocation: "中国香港",
        nodeName: "🇭🇰 香港 IEPL 01",
    };

    setMockFetch(async (url: string) => {
        if (url.startsWith(pluginUrl)) {
            return mockResponse(pluginBody);
        }
        if (url.startsWith(subUrl)) {
            return mockResponse("PROXIES...", {
                "subscription-userinfo": `upload=${upBytes}; download=${downBytes}; total=${totBytes}; expire=${expireSec}`,
            });
        }
        throw new Error(`Unexpected url: ${url}`);
    });

    const res = await data.fetchLoonData(pluginUrl, true, subUrl);
    assert.equal(res.serviceId, "loon");
    // 规则分流与运行节点来自 Loon 插件
    assert.equal(res.runningMode, "规则分流", "运行模式融合自 Loon 插件");
    assert.equal(res.nodeName, "🇭🇰 香港 IEPL 01", "当前节点融合自 Loon 插件");
    assert.equal(res.policyGroupCount, 3, "策略组数量融合自 Loon 插件");
    assert.equal(res.delayMs, 38, "实时延迟融合自 Loon 插件");
    assert.equal(res.vpnIp, "103.152.220.1", "出口 IP 融合自 Loon 插件");
    assert.equal(res.vpnLocation, "中国香港", "归属地融合自 Loon 插件");

    // 上下行与剩余流量来自机场订阅
    assert.equal(res.uploadText, "5.8 GB", "上传流量融合自机场订阅");
    assert.equal(res.downloadText, "102.6 GB", "下载流量融合自机场订阅");
    assert.equal(res.totalText, "500 GB", "总额融合自机场订阅");
    assert.equal(res.remainingText, "391.6 GB", "剩余流量融合自机场订阅");
    assert.ok(res.resetDaysText.includes("24 天后重置"), "到期重置天数融合自机场订阅");
    assert.equal(res.hasTrafficData, true, "标记已拥有真实流量");
    assert.equal(res.isFused, true, "双通道融合标记为 true");
}

// ── 9. Storage 持久化双通道融合与 refreshLoonData ────────────────
async function testFetchLoonFusionFromStorage(): Promise<void> {
    resetGlobals();
    const pluginUrl = "http://loon.box/api/monitor";
    const subUrl = "https://my-airport.io/api/v1/client/subscribe?token=secret123";

    data.saveLoonPluginUrl(pluginUrl);
    data.saveLoonSubUrl(subUrl);

    assert.equal(data.loadLoonPluginUrl(), pluginUrl);
    assert.equal(data.loadLoonSubUrl(), subUrl);

    const upBytes = 1024 * 1024 * 1024 * 2;
    const downBytes = 1024 * 1024 * 1024 * 20;
    const totBytes = 1024 * 1024 * 1024 * 100;

    setMockFetch(async (url: string) => {
        if (url.includes("loon.box")) {
            return mockResponse({
                running_model: 1,
                runningMode: "规则分流",
                all_policy_groups: ["Proxy", "Media"],
                delay: 42,
                nodeName: "日本 01",
            });
        }
        if (url.includes("my-airport.io")) {
            return mockResponse("NODES...", {
                "subscription-userinfo": `upload=${upBytes}; download=${downBytes}; total=${totBytes}; expire=1800000000`,
            });
        }
        throw new Error(`Unexpected url: ${url}`);
    });

    const res = await data.refreshLoonData();
    assert.equal(res.runningMode, "规则分流");
    assert.equal(res.nodeName, "日本 01");
    assert.equal(res.policyGroupCount, 2);
    assert.equal(res.uploadText, "2 GB");
    assert.equal(res.downloadText, "20 GB");
    assert.equal(res.totalText, "100 GB");
    assert.equal(res.remainingText, "78 GB");
    assert.equal(res.isFused, true);
}

// ── 10. 历史单主键存入订阅链接时平滑兼容并自动直连插件 ─────────
async function testLegacySubscriptionInMainKeyAutoFusion(): Promise<void> {
    resetGlobals();
    const subUrl = "https://legacy-sub.net/subscribe?token=abc";
    // 模拟旧版本用户直接在 LOON_URL_KEY 填入订阅链接的情形
    data.saveLoonUrl(subUrl);

    assert.equal(data.loadLoonSubUrl(), subUrl, "历史订阅链接自动识别为 subUrl");
    assert.equal(data.loadLoonPluginUrl(), data.DEFAULT_LOON_URL, "插件通道默认自动回退至本地直连");

    setMockFetch(async (url: string) => {
        if (url.includes("loon.box")) {
            return mockResponse({
                running_model: 1,
                runningMode: "规则分流",
                nodeName: "新加坡 IPLC",
            });
        }
        if (url.includes("legacy-sub.net")) {
            return mockResponse("SUB...", {
                "subscription-userinfo": "upload=1073741824; download=10737418240; total=107374182400; expire=0",
            });
        }
        throw new Error(`Unexpected url: ${url}`);
    });

    const res = await data.refreshLoonData();
    assert.equal(res.runningMode, "规则分流", "平滑兼容下依然获取到规则分流");
    assert.equal(res.nodeName, "新加坡 IPLC", "平滑兼容下依然获取到节点");
    assert.equal(res.uploadText, "1 GB", "平滑兼容下依然获取到上行用量");
    assert.equal(res.downloadText, "10 GB", "平滑兼容下依然获取到下行用量");
    assert.equal(res.isFused, true);
}

// ── 11. 单边离线容灾：Loon 插件离线时仍可展示订阅流量 ───────────
async function testPartialOfflineGraceful(): Promise<void> {
    resetGlobals();
    data.saveLoonPluginUrl("http://loon.box/api/monitor");
    data.saveLoonSubUrl("https://airport.com/sub");

    // 模拟手机未开启 Loon VPN（loon.box 超时/拒绝连接），但网络正常可拉取机场订阅
    setMockFetch(async (url: string) => {
        if (url.includes("loon.box")) {
            throw new Error("Connection refused (Loon not running)");
        }
        if (url.includes("airport.com")) {
            return mockResponse("SUB...", {
                "subscription-userinfo": "upload=1073741824; download=5368709120; total=53687091200; expire=0",
            });
        }
        throw new Error(`Unexpected url: ${url}`);
    });

    const res = await data.refreshLoonData();
    assert.equal(res.configured, true, "订阅成功拉取时组件保持配置生效状态");
    assert.equal(res.hasTrafficData, true, "流量数据正常保留");
    assert.equal(res.uploadText, "1 GB");
    assert.equal(res.downloadText, "5 GB");
    assert.equal(res.nodeName, "未连接", "插件离线时节点标记未连接");
    assert.equal(res.runningMode, "--", "插件离线时运行模式标记未知占位");
    assert.equal(res.isFused, false, "单边成功时不标记为完整双通道融合");
}

// ── 12. 插件 payload 字段别名 + 流量缓存抗抖动 ──────────────────
// 回归 1：真机 LoonMonitor 插件返回 camelCase（uploadBytes / downloadBytes /
//   totalBytes / delayMs / policyGroupCount），而实现只认短名（upload / delay /
//   policy_groups_count）→ 插件侧流量被丢弃、策略组恒为 0、延迟退化成请求耗时。
// 回归 2：直连拉取机场订阅偶发失败时，旧实现照样写下一份「流量全 --」的缓存，
//   把上一次已知的真实流量擦掉，小组件表现为「设置了订阅却没有信息」。
async function testLoonPluginFieldAliasesAndCarryOver(): Promise<void> {
    resetGlobals();
    const pluginUrl = "http://loon.box/api/monitor";
    const subUrl = "https://sub.example.com/subscribe";

    const pluginWithTraffic = {
        status: "running",
        runningMode: "规则分流",
        policyGroupCount: 14,
        nodeName: "节点A",
        delayMs: 1500,
        uploadBytes: 1073741824,
        downloadBytes: 5368709120,
        totalBytes: 53687091200,
        resetDaysText: "20 天后重置",
    };

    // 阶段 1：插件带上流量（camelCase 命名），订阅直连失败
    setMockFetch(async (url: string) => {
        if (url.includes("loon.box")) return mockResponse(pluginWithTraffic);
        throw new Error("subscription request failed");
    });
    const s1 = await data.fetchLoonData(pluginUrl, true, subUrl);
    assert.equal(s1.uploadText, "1 GB", "uploadBytes 别名被识别");
    assert.equal(s1.downloadText, "5 GB", "downloadBytes 别名被识别");
    assert.equal(s1.totalText, "50 GB", "totalBytes 别名被识别");
    assert.equal(s1.remainingText, "44 GB", "剩余 = 总额 - 上行 - 下行");
    assert.equal(s1.policyGroupCount, 14, "policyGroupCount 别名被识别（不再恒为 0）");
    assert.equal(s1.delayMs, 1500, "delayMs 别名被识别（不再用请求耗时冒充节点延迟）");
    assert.equal(s1.errorText, undefined, "插件已给出流量时不标注缓存回退");

    // 阶段 2：插件无流量 + 订阅仍失败 → 保留上次流量并如实标注
    setMockFetch(async (url: string) => {
        if (url.includes("loon.box")) {
            return mockResponse({
                ...pluginWithTraffic,
                uploadBytes: 0,
                downloadBytes: 0,
                totalBytes: 0,
                delayMs: 0,
                resetDaysText: "长期有效",
            });
        }
        throw new Error("subscription request failed");
    });
    const s2 = await data.fetchLoonData(pluginUrl, true, subUrl);
    assert.equal(s2.uploadText, "1 GB", "订阅同步失败时保留上次已知流量");
    assert.equal(s2.downloadText, "5 GB", "保留上次下行");
    assert.equal(s2.totalText, "50 GB", "保留上次总额");
    assert.equal(s2.resetDaysText, "20 天后重置", "保留上次到期文案");
    assert.ok(
        String(s2.errorText || "").includes("缓存流量"),
        `应标注展示的是缓存流量，实际：${s2.errorText}`
    );
    assert.equal(data.getLoonData().uploadText, "1 GB", "缓存中即为保留后的值");

    // 阶段 3：订阅恢复 → 真实流量覆盖保留值并清除失败标注
    setMockFetch(async (url: string) => {
        if (url.includes("loon.box")) return mockResponse(pluginWithTraffic);
        if (url.includes("sub.example.com")) {
            return mockResponse("NODES", {
                "subscription-userinfo": "upload=1073741824; download=2147483648; total=53687091200; expire=0",
            });
        }
        throw new Error(`Unexpected url: ${url}`);
    });
    const s3 = await data.fetchLoonData(pluginUrl, true, subUrl);
    assert.equal(s3.uploadText, "1 GB");
    assert.equal(s3.downloadText, "2 GB", "恢复后使用本次订阅数据");
    assert.equal(s3.errorText, undefined, "同步恢复后清除失败标注");
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
    ["双通道显式融合：规则分流+机场订阅", testFetchLoonFusionDirect],
    ["Storage 双通道持久化与 refreshLoonData", testFetchLoonFusionFromStorage],
    ["历史单主键存入订阅平滑兼容", testLegacySubscriptionInMainKeyAutoFusion],
    ["单边离线优雅容灾", testPartialOfflineGraceful],
    ["插件字段别名与流量缓存抗抖动", testLoonPluginFieldAliasesAndCarryOver],
];

let passed = 0;
for (const [name, fn] of tests) {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
}
console.log(`PASS ${passed} loon checks`);
