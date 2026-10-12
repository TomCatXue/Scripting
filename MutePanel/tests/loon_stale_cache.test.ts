// Loon 缓存回退诚实性回归：刷新失败但有历史缓存时，必须标记本次失败。
//
// 回归背景：设置页的「测试连接」曾把「刷新失败 + 展示旧缓存」误报为
// 「获取成功」，用户无法判断 LoonMonitor 插件是否真的接通。
import assert from "node:assert/strict";
import { installGlobals, resetGlobals } from "./globals.ts";
import { setMockFetch } from "./scripting.mock.ts";

installGlobals();

const data = await import("../data.ts");
const types = await import("../types.ts");

function seedLoonCache(): void {
    const cached = {
        ...types.DEFAULT_LOON,
        serviceId: "loon",
        configured: true,
        errorText: undefined,
        downloadText: "102.6 GB",
        uploadText: "5.8 GB",
        vpnIp: "198.51.100.9",
        updatedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    };
    // 使用 data.ts 导出的真实缓存键，避免测试与实现漂移。
    Storage.set(
        data.LOON_CACHE_KEY,
        { expiresAt: Date.now() - 1000, data: cached },
        { shared: true }
    );
    Storage.set(data.LOON_CACHE_KEY, { expiresAt: Date.now() - 1000, data: cached });
}

async function testStaleCacheMarkedAsFailure(): Promise<void> {
    resetGlobals();
    seedLoonCache();
    setMockFetch(async () => {
        throw new Error("网络连接已中断");
    });

    const res = await data.fetchLoonData("http://loon.box/api/monitor", true);

    assert.ok(res, "有缓存时必须仍返回数据，保证小组件可用");
    assert.equal(res.configured, true, "缓存数据仍然可展示");
    assert.equal(res.vpnIp, "198.51.100.9", "保留缓存里的真实字段");
    assert.ok(
        res.errorText && res.errorText.includes("刷新失败"),
        `本次刷新失败必须显式标记，实际 errorText=${res.errorText}`
    );
    assert.ok(
        res.errorText.includes("缓存"),
        "提示文案说明当前展示的是缓存"
    );
}

async function testFreshSuccessClearsError(): Promise<void> {
    resetGlobals();
    seedLoonCache();
    setMockFetch(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () =>
            JSON.stringify({
                status: "running",
                running_mode: 1,
                running_model: 1,
                policy_groups_count: 12,
                nodeName: "🇯🇵Japan 02",
                vpnIp: "203.0.113.7",
                vpnLocation: "日本 · 东京",
                upload: 1,
                download: 2,
                total: 100,
            }),
    }));

    const res = await data.fetchLoonData("http://loon.box/api/monitor", true);
    assert.equal(res.configured, true);
    assert.equal(res.errorText, undefined, "刷新成功必须清除上一次的错误标记");
    assert.equal(res.vpnIp, "203.0.113.7", "使用本次拉取到的新值");
}

const tests: [string, () => Promise<void> | void][] = [
    ["缓存回退被标记为刷新失败", testStaleCacheMarkedAsFailure],
    ["刷新成功清除错误标记", testFreshSuccessClearsError],
];

let passed = 0;
for (const [name, fn] of tests) {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
}
console.log(`PASS ${passed} loon stale-cache checks`);
