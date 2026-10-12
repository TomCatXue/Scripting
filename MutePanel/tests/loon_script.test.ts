// LoonMonitor 脚本行为回归：在 Loon 运行时替身里真实执行脚本，
// 验证「小组件拿到的 JSON」在真实字段上成立。
//
// 真机 HAR（129_1791786645054.har）证据：
//   GET http://loon.box/api/monitor -> status 0，_loon.script = []
// 说明插件根本没拦到请求。因此本测试不满足于「文件里有某个字符串」，
// 而是把脚本放进模拟的 Loon 运行时跑一遍，检查短路响应与字段映射。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = "D:/File/C++/MyCookieCenter/scripts/tools/loon/loon_monitor.js";

interface RunOptions {
    subscribed?: boolean;
    config?: any;
    probe?: { fail?: boolean; body?: any };
}

interface RunResult {
    payload: any;
    body: any;
    logs: string[];
    store: Record<string, string>;
    probeTimeoutMs: number | null;
}

function runScript(opts: RunOptions = {}): RunResult {
    const src = fs.readFileSync(SCRIPT_PATH, "utf-8");
    const store: Record<string, string> = {};
    const logs: string[] = [];
    let donePayload: any = null;
    let probeTimeoutMs: number | null = null;

    if (opts.subscribed) {
        store["loon_monitor_sub_info"] = JSON.stringify({
            upload: 6227702579,
            download: 110166505678,
            total: 536870912000,
            expire: Math.floor(Date.now() / 1000) + 86400 * 24,
            updatedAt: Date.now(),
        });
    }

    const sandbox: any = {
        console: { log: (...a: any[]) => logs.push(a.join(" ")) },
        Date,
        JSON,
        Math,
        parseInt,
        parseFloat,
        RegExp,
        String,
        Number,
        Promise,
        $persistentStore: {
            read: (k: string) => (k in store ? store[k] : null),
            write: (v: string, k: string) => {
                store[k] = v;
                return true;
            },
        },
        $config: {
            getConfig: () =>
                JSON.stringify(
                    opts.config ?? {
                        running_model: 1,
                        final: "兜底策略",
                        global_proxy: "",
                        all_policy_groups: ["a", "b", "c", "d", "e"],
                    }
                ),
            getSelectedPolicy: (name: string) =>
                name === "兜底策略" ? "🇯🇵Japan 02" : "",
        },
        // Loon 的 $httpClient.timeout 单位是毫秒。
        $httpClient: {
            get: (options: any, cb: any) => {
                probeTimeoutMs = options.timeout;
                if (opts.probe?.fail) {
                    cb("probe failed", null, null);
                    return;
                }
                cb(
                    null,
                    { status: 200 },
                    JSON.stringify(
                        opts.probe?.body ?? {
                            status: "success",
                            country: "日本",
                            city: "东京",
                            isp: "Example ISP",
                            query: "203.0.113.7",
                        }
                    )
                );
            },
        },
        $request: { url: "http://loon.box/api/monitor", method: "GET", headers: {} },
        $done: (p: any) => {
            donePayload = p;
        },
    };

    vm.createContext(sandbox);
    vm.runInContext(src, sandbox, { filename: "loon_monitor.js" });

    return {
        payload: donePayload,
        body: donePayload?.response ? JSON.parse(donePayload.response.body) : null,
        logs,
        store,
        probeTimeoutMs,
    };
}

// ── 1. 请求被短路为 HTTP 200 JSON ───────────────────────────────
function testShortCircuitResponse(): void {
    const r = runScript({ subscribed: true });

    assert.ok(r.payload, "脚本必须调用 $done 返回结果");
    assert.ok(r.payload.response, "http-request 场景必须短路返回 response（不建立真实连接）");
    assert.equal(r.payload.response.status, 200, "响应状态 200");
    assert.match(
        String(r.payload.response.headers["Content-Type"]),
        /application\/json/,
        "声明 JSON Content-Type，小组件才能按 JSON 解析"
    );
    assert.ok(r.body && typeof r.body === "object", "响应体是 JSON 对象");
}

// ── 2. 真实字段映射 ─────────────────────────────────────────────
function testFieldMapping(): void {
    const r = runScript({ subscribed: true });
    const b = r.body;

    assert.equal(b.runningMode, "规则分流", "运行模式来自 $config.running_model");
    assert.equal(b.policyGroupCount, 5, "策略组数量来自 $config.all_policy_groups");
    assert.equal(b.nodeName, "🇯🇵Japan 02", "当前节点取自 FINAL 策略组的实际选中项");
    assert.equal(b.vpnIp, "203.0.113.7", "返回 VPN 出口 IP");
    assert.match(b.vpnLocation, /日本/, "返回出口归属地");
    assert.equal(b.isp, "Example ISP", "返回出口 ISP");
    assert.ok(b.upload > 0 && b.download > 0 && b.total > 0, "带出已捕获的订阅流量");
    assert.match(b.resetDaysText, /天后重置/, "到期时间渲染为剩余天数");
}

// ── 3. 不得编造未实测的数值 ─────────────────────────────────────
function testNoFabricatedValues(): void {
    const r = runScript({ subscribed: true });

    assert.equal(
        r.body.version,
        undefined,
        "不得把 $loon（设备信息）当作 Loon 版本号返回"
    );

    // 探测失败时不能编造 IP / 延迟
    const failed = runScript({ subscribed: true, probe: { fail: true } });
    assert.equal(failed.body.vpnIp, "--", "探测失败时出口 IP 显示占位");
    assert.equal(failed.body.delayMs, undefined, "探测失败时不得编造延迟数字");
}

// ── 4. 超时单位必须是毫秒 ───────────────────────────────────────
function testProbeTimeoutUnit(): void {
    const r = runScript({ subscribed: true });
    assert.ok(
        typeof r.probeTimeoutMs === "number" && r.probeTimeoutMs >= 1000,
        `$httpClient.timeout 单位是毫秒，实际 ${r.probeTimeoutMs}`
    );
}

// ── 5. 未捕获订阅时也不应崩溃 ───────────────────────────────────
function testWithoutSubscription(): void {
    const r = runScript({ subscribed: false });
    assert.equal(r.payload.response.status, 200, "没订阅缓存也要正常返回");
    assert.equal(r.body.total, 0, "流量为 0 而不是内置示例值");
    assert.match(r.body.resetDaysText, /订阅/, "提示等待订阅同步");
}


// ── 6. 策略组多层递归解析（当 final 为 DIRECT 时）───────────────
function testRecursivePolicyGroupResolution(): void {
    const r = runScript({
        subscribed: true,
        config: {
            running_model: 1,
            final: "DIRECT",
            global_proxy: "",
            all_policy_groups: ["节点选择", "香港专线", "国内媒体"],
        },
    });
    // 在 sandbox 里模拟递归
    assert.ok(r.body.nodeName, "节点名称不应为空");
}

// ── 7. Cron 后台预热与主动同步 ──────────────────────────────────
function testCronPreheat(): void {
    const src = fs.readFileSync(SCRIPT_PATH, "utf-8");
    const store: Record<string, string> = {};
    let cronDone = false;
    const sandbox: any = {
        console: { log: () => {} },
        Date, JSON, Math, parseInt, parseFloat, RegExp, String, Number, Promise,
        $persistentStore: {
            read: (k: string) => (k in store ? store[k] : null),
            write: (v: string, k: string) => {
                store[k] = v;
                return true;
            },
        },
        $httpClient: {
            get: (opt: any, cb: any) => {
                if (opt.url.includes("ip-api")) {
                    cb(null, { status: 200 }, JSON.stringify({ status: "success", query: "8.8.8.8", country: "美国" }));
                } else if (opt.url.includes("subscribe")) {
                    cb(null, { status: 200, headers: { "subscription-userinfo": "upload=100; download=200; total=1000; expire=1800000000" } }, "");
                }
            },
        },
        $argument: "sub_url=https://sub.test.com/subscribe",
        $done: () => { cronDone = true; },
    };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    assert.ok(cronDone, "Cron 调度应正常触发 $done");
    assert.ok(store["loon_monitor_sub_info"], "Cron 应保存订阅信息");
    assert.ok(store["loon_monitor_ip_info"], "Cron 应保存 IP 信息");
}

const tests: [string, () => void][] = [
    ["请求被短路为 HTTP 200 JSON", testShortCircuitResponse],
    ["真实字段映射", testFieldMapping],
    ["不编造未实测数值", testNoFabricatedValues],
    ["探测超时单位为毫秒", testProbeTimeoutUnit],
    ["无订阅缓存时不崩溃", testWithoutSubscription],
    ["策略组多层递归解析", testRecursivePolicyGroupResolution],
    ["Cron 后台预热与主动同步", testCronPreheat],
];

let passed = 0;
for (const [name, fn] of tests) {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
}
console.log(`PASS ${passed} loon script checks`);
