// data.ts 多账号接入的回归测试。
// 重点：单账号（含 legacy 迁移路径）输出必须与改造前逐字段一致。
// 运行：node --import "./MutePanel/tests/register.mjs" "./MutePanel/tests/data.test.ts"
import assert from "node:assert/strict";
import { installGlobals, resetGlobals, keychainRaw, storageRaw } from "./globals.ts";
import { setMockFetch, authOf } from "./scripting.mock.ts";

// 必须先装全局桩，再动态导入 data.ts
// （data.ts 模块顶层就求值 FileManager.appGroupDocumentsDirectory）
installGlobals();

const data = await import("../data.ts");
const accounts = await import("../accounts.ts");
const wbDirect = await import("../wb_direct.ts");

const { LEGACY_ACCOUNT_ID } = accounts;

// ── 测试用响应构造 ─────────────────────────────────────────────
function jsonResponse(body: any, status = 200): any {
    return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body) };
}

/**
 * 北京时间「今天 0 点」的秒级时间戳 —— 与 data.ts 的 bjDayStartSec 同口径。
 * 逐日消费必须落在这个窗口内，否则会被近 7 日过滤掉。
 */
function bjTodaySec(): number {
    return Math.floor((Date.now() + 8 * 3600_000) / 86_400_000) * 86_400 + 0 - 8 * 3600;
}

/** DeepSeek 网页版接口的最小响应 */
function deepseekHandler(url: string): any {
    if (url.includes("/users/get_user_summary")) {
        return jsonResponse({
            code: 0,
            data: {
                biz_data: {
                    normal_wallets: [{ balance: "10.00", currency: "CNY" }],
                    bonus_wallets: [{ balance: "5.00", currency: "CNY" }],
                    total_costs: [{ amount: "100.00", currency: "CNY" }],
                },
            },
        });
    }
    if (url.includes("/usage/by_api_key/cost")) {
        return jsonResponse({
            code: 0,
            data: {
                biz_data: {
                    data: [{ series: [{ buckets: [{ time: bjTodaySec(), cost: "1.50" }] }] }],
                },
            },
        });
    }
    return jsonResponse({}, 404);
}

// ── 1. 单账号（legacy）与改造前一致 ───────────────────────────
async function testSingleLegacyDeepSeek(): Promise<void> {
    resetGlobals();
    keychainRaw()["dashboard_kit_deepseek_token"] = "web-token-abc";

    setMockFetch(async (req: any) => deepseekHandler(String(req?.url ?? req)));

    const r = await data.refreshDeepSeekData();
    assert.ok(r, "刷新应返回结果");
    assert.equal(r.mainValue, "15.00", "余额 = 10 + 5");
    assert.equal(r.subValue2, "¥1.50", "近 7 日消费");
    assert.equal(r.totalCostText, "¥100.00", "累计消费");
    assert.equal(r.footerLeft, "官方直连", "单账号页脚不带账号数");
    assert.equal(r.trend7d.length, 7, "走势为 7 个点");
}

// ── 2. 多账号求和 + 逐日相加 ──────────────────────────────────
async function testMultiAccountDeepSeek(): Promise<void> {
    resetGlobals();
    keychainRaw()["dashboard_kit_deepseek_token"] = "web-token-abc";
    const b = accounts.addAccount("deepseek", "第二个账号");
    accounts.setAccountCredential("deepseek", b.id, "token", "web-token-def");

    setMockFetch(async (req: any) => deepseekHandler(String(req?.url ?? req)));

    const r = await data.refreshDeepSeekData();
    assert.ok(r, "多账号刷新应返回结果");
    assert.equal(r.mainValue, "30.00", "两个账号余额相加");
    assert.equal(r.subValue2, "¥3.00", "近 7 日消费相加");
    assert.ok(r.footerLeft.includes("2 账号"), `页脚标注账号数，实际: ${r.footerLeft}`);

    // 逐日走势应是「按日相加」而非快照：同一天两个账号各 1.50 → 3.00
    const total = r.trend7d.reduce((a: number, p: any) => a + Number(p.value || 0), 0);
    assert.equal(total, 3.0, "同一天两个账号的消费相加");
}

// ── 3. 停用的账号不参与聚合 ───────────────────────────────────
async function testDisabledAccountExcluded(): Promise<void> {
    resetGlobals();
    keychainRaw()["dashboard_kit_deepseek_token"] = "web-token-abc";
    const b = accounts.addAccount("deepseek", "第二个账号");
    accounts.setAccountCredential("deepseek", b.id, "token", "web-token-def");
    accounts.setAccountEnabled("deepseek", b.id, false);

    setMockFetch(async (req: any) => deepseekHandler(String(req?.url ?? req)));

    const r = await data.refreshDeepSeekData();
    assert.equal(r.mainValue, "15.00", "停用账号不计入");
    assert.equal(r.footerLeft, "官方直连", "只剩一个启用账号，页脚不带账号数");
}

// ── 4. 全部账号失败 → 返回 null（保留旧缓存）──────────────────
async function testAllAccountsFail(): Promise<void> {
    resetGlobals();
    keychainRaw()["dashboard_kit_deepseek_token"] = "web-token-abc";

    setMockFetch(async () => jsonResponse({}, 500));

    const r = await data.refreshDeepSeekData();
    assert.equal(r, null, "全部失败返回 null，由调用方保留旧缓存");
}

// ── 5. 部分失败 → 用成功者聚合并标注可用数 ────────────────────
async function testPartialFailure(): Promise<void> {
    resetGlobals();
    keychainRaw()["dashboard_kit_deepseek_token"] = "web-token-abc";
    const b = accounts.addAccount("deepseek", "会失败的账号");
    accounts.setAccountCredential("deepseek", b.id, "token", "web-token-bad");

    setMockFetch(async (req: any, init?: any) => {
        const url = String(req?.url ?? req);
        // 第二个账号的 token 一律失败（token 在 Authorization 头里）
        if (authOf(init).includes("web-token-bad")) return jsonResponse({}, 500);
        return deepseekHandler(url);
    });

    const r = await data.refreshDeepSeekData();
    assert.ok(r, "部分失败仍应返回结果");
    assert.equal(r.mainValue, "15.00", "只统计成功账号");
    assert.ok(r.footerLeft.includes("可用 1/2"), `标注可用数，实际: ${r.footerLeft}`);
}

// ── 6. Codex 多账号求和 + 最低标注 ────────────────────────────
function codexHandler(pct5h: number, pctWeek: number, resets: number): (url: string) => any {
    return () =>
        jsonResponse({
            rate_limit: {
                primary_window: { remaining_percent: pct5h, reset_at: Date.now() + 3600_000 },
                secondary_window: { remaining_percent: pctWeek, reset_at: Date.now() + 86400_000 },
            },
            rate_limit_reset_credits: { available_count: resets },
        });
}

async function testCodexMultiAccount(): Promise<void> {
    resetGlobals();
    keychainRaw()["dashboard_kit_codex_token"] = "tok-a";
    const b = accounts.addAccount("codex", "账号B");
    accounts.setAccountCredential("codex", b.id, "token", "tok-b");

    // 两个账号返回不同的额度（按 Authorization 头区分）
    setMockFetch(async (req: any, init?: any) => {
        const url = String(req?.url ?? req);
        return authOf(init).includes("tok-a") ? codexHandler(83, 50, 2)(url) : codexHandler(41, 20, 1)(url);
    });

    const r = await data.refreshCodexData();
    assert.ok(r, "Codex 多账号应返回结果");
    assert.equal(r.item1.pct, 124, "5 小时额度求和 83+41");
    assert.equal(r.item2.pct, 70, "周额度求和 50+20");
    assert.equal(r.stat1.value, "3 次", "重置次数求和 2+1");
    assert.ok(r.footerStatus.includes("最低"), `标注最低值，实际: ${r.footerStatus}`);
    assert.ok(r.footerStatus.includes("41.0%"), `最低为 41.0%，实际: ${r.footerStatus}`);
}

async function testCodexSingleAccountUnchanged(): Promise<void> {
    resetGlobals();
    keychainRaw()["dashboard_kit_codex_token"] = "tok-a";

    setMockFetch(async (req: any) => codexHandler(83, 50, 2)(String(req?.url ?? req)));

    const r = await data.refreshCodexData();
    assert.equal(r.item1.pct, 83, "单账号 5 小时额度原样");
    assert.equal(r.item2.pct, 50, "单账号周额度原样");
    assert.equal(r.stat1.value, "2 次", "单账号重置次数原样");
    assert.equal(r.footerStatus, "剩余 83.0%", "单账号页脚与改造前一致");
}

// ── 7. Antigravity 多账号 ─────────────────────────────────────
function antigravityHandler(gem: number, claude: number): (url: string) => any {
    return () =>
        jsonResponse({
            groups: [
                {
                    buckets: [
                        { bucketId: "gemini-5h", remainingFraction: gem / 100, resetTime: Date.now() + 3600_000 },
                        { bucketId: "gemini-week", remainingFraction: 0.8 },
                        { bucketId: "3p-5h", remainingFraction: claude / 100, resetTime: Date.now() + 7200_000 },
                        { bucketId: "3p-week", remainingFraction: 0.9 },
                    ],
                },
            ],
        });
}

async function testAntigravityMultiAccount(): Promise<void> {
    resetGlobals();
    keychainRaw()["dashboard_kit_antigravity_token"] = "ag-a";
    const b = accounts.addAccount("antigravity", "AG-B");
    accounts.setAccountCredential("antigravity", b.id, "token", "ag-b");

    setMockFetch(async (req: any, init?: any) => {
        const url = String(req?.url ?? req);
        return authOf(init).includes("ag-a") ? antigravityHandler(90, 80)(url) : antigravityHandler(50, 40)(url);
    });

    const r = await data.refreshAntigravityData();
    assert.ok(r, "Antigravity 多账号应返回结果");
    assert.equal(r.item1.pct, 140, "Gemini 求和 90+50");
    assert.equal(r.item2.pct, 120, "Claude 求和 80+40");
    assert.ok(r.footerStatus.includes("40.0%"), `最紧为 40.0%，实际: ${r.footerStatus}`);
}

// ── 8. WorkBuddy 直连：凭据存取与积分聚合 ────────────────────
async function testWbDirectMultiAccount(): Promise<void> {
    resetGlobals();
    const a = accounts.addAccount("workbuddy_direct", "WB-A");
    const b = accounts.addAccount("workbuddy_direct", "WB-B");

    const credA = {
        type: "oauth", access: "acc-a", refresh: "ref-a",
        expires: Date.now() + 30 * 86400_000, refreshExpiresAt: Date.now() + 30 * 86400_000,
        accountId: "138****0001", uid: "uid-a", domain: "copilot.tencent.com", tokenType: "Bearer",
    };
    const credB = { ...credA, access: "acc-b", refresh: "ref-b", uid: "uid-b", accountId: "138****0002" };

    data.setWbDirectCredential(a.id, wbDirect.parseWbDirectCredential(JSON.stringify(credA)));
    data.setWbDirectCredential(b.id, wbDirect.parseWbDirectCredential(JSON.stringify(credB)));

    setMockFetch(async (req: any, init?: any) => {
        const auth = authOf(init);
        const total = auth.includes("acc-a") ? 100 : 50;
        return jsonResponse({
            code: 0,
            data: {
                IsPaidUser: true,
                Packages: [{ CycleTotalCapacity: String(total), CycleUsedCapacity: "10" }],
            },
        });
    });

    const r = await data.refreshWbDirectData();
    assert.ok(r, "WorkBuddy 直连应返回结果");
    // 总量 150，已用 20 → 剩余 130
    assert.equal(r.mainValue, "130", "剩余积分为两账号之和");
    assert.equal(r.subValue2, "20", "已用为两账号之和");
    assert.equal(r.serviceId, "workbuddy-direct", "服务 id");
}

async function testWbDirectUnconfigured(): Promise<void> {
    resetGlobals();
    assert.equal(data.hasWbDirectConfigured(), false, "未配置时为 false");
    assert.equal(await data.refreshWbDirectData(), null, "未配置时刷新返回 null");
    const d = data.getWbDirectData();
    assert.equal(d.serviceId, "workbuddy-direct", "无缓存时回落默认对象");
}

// ── 8b. 直连：异常响应必须判为失败，而不是「成功但为 0」──────
async function testWbDirectRejectsNonJson(): Promise<void> {
    resetGlobals();
    const a = accounts.addAccount("workbuddy_direct", "WB-A");
    data.setWbDirectCredential(
        a.id,
        wbDirect.parseWbDirectCredential(
            JSON.stringify({
                type: "oauth", access: "acc-a", refresh: "ref-a",
                expires: Date.now() + 30 * 86400_000,
                accountId: "138****0001", uid: "uid-a",
                domain: "copilot.tencent.com", tokenType: "Bearer",
            })
        )
    );

    // 网关返回 HTML 错误页（不是 JSON）—— 早期实现会当成成功且积分全 0
    setMockFetch(async () => ({
        status: 200, ok: true,
        text: async () => "<html><body>502 Bad Gateway</body></html>",
    }));

    const r = await data.refreshWbDirectData();
    assert.equal(r, null, "非 JSON 响应必须判为失败，不得返回全 0 的成功结果");
    assert.ok(
        /不是 JSON/.test(data.getWbDirectLastError()),
        `失败原因应说明响应非 JSON，实际: ${data.getWbDirectLastError()}`
    );
}

async function testWbDirectRejectsMissingData(): Promise<void> {
    resetGlobals();
    const a = accounts.addAccount("workbuddy_direct", "WB-A");
    data.setWbDirectCredential(
        a.id,
        wbDirect.parseWbDirectCredential(
            JSON.stringify({
                type: "oauth", access: "acc-a", refresh: "ref-a",
                expires: Date.now() + 30 * 86400_000,
                accountId: "138****0001", uid: "uid-a",
                domain: "copilot.tencent.com",
            })
        )
    );

    // 合法 JSON 但缺 data
    setMockFetch(async () => jsonResponse({ code: 0 }));
    assert.equal(await data.refreshWbDirectData(), null, "缺 data 字段判为失败");
    assert.ok(/缺少 data/.test(data.getWbDirectLastError()), "原因说明缺 data");

    // 业务错误码
    setMockFetch(async () => jsonResponse({ code: 14018, msg: "Credits exhausted" }));
    assert.equal(await data.refreshWbDirectData(), null, "业务错误码判为失败");
    assert.ok(/14018|Credits/.test(data.getWbDirectLastError()), "原因带错误码");

    // HTTP 失败
    setMockFetch(async () => jsonResponse({ msg: "Unauthorized" }, 401));
    assert.equal(await data.refreshWbDirectData(), null, "HTTP 401 判为失败");
    assert.ok(/401/.test(data.getWbDirectLastError()), "原因带状态码");
}

async function testWbDirectSuccessClearsError(): Promise<void> {
    resetGlobals();
    const a = accounts.addAccount("workbuddy_direct", "WB-A");
    data.setWbDirectCredential(
        a.id,
        wbDirect.parseWbDirectCredential(
            JSON.stringify({
                type: "oauth", access: "acc-a", refresh: "ref-a",
                expires: Date.now() + 30 * 86400_000,
                accountId: "138****0001", uid: "uid-a",
                domain: "copilot.tencent.com",
            })
        )
    );

    setMockFetch(async () => jsonResponse({ code: 0, data: { Packages: [] } }));
    const r = await data.refreshWbDirectData();
    assert.ok(r, "合法响应应成功");
    assert.equal(data.getWbDirectLastError(), "", "成功后清空上次的失败原因");
}

// ── 9. 配置态判定 ─────────────────────────────────────────────
async function testConfiguredFlags(): Promise<void> {
    resetGlobals();
    assert.equal(data.hasCodexConfigured(), false, "空配置 Codex 为 false");
    keychainRaw()["dashboard_kit_codex_token"] = "t";
    assert.equal(data.hasCodexConfigured(), true, "有遗留键即为 true");

    resetGlobals();
    assert.equal(data.hasDeepSeekConfigured(), false, "空配置 DeepSeek 为 false");
    keychainRaw()["dashboard_kit_deepseek_token"] = "t";
    assert.equal(data.hasDeepSeekConfigured(), true, "有遗留键即为 true");
}

// ── 10. 注册表被使用（迁移生效）───────────────────────────────
async function testMigrationSeedsRegistry(): Promise<void> {
    resetGlobals();
    keychainRaw()["dashboard_kit_codex_token"] = "legacy-tok";

    // 播种发生在「首次读取」时：此前 Storage 里没有注册表
    assert.equal(
        storageRaw()[accounts.registryKey("codex")],
        undefined,
        "读取前 Storage 中不存在注册表"
    );

    await data.refreshCodexData().catch(() => null);

    const seeded = accounts.listAccounts("codex");
    assert.equal(seeded.length, 1, "刷新后自动播种 legacy 账号");
    assert.equal(seeded[0].id, LEGACY_ACCOUNT_ID, "播种 id 为 legacy");
    assert.equal(seeded[0].label, "默认账号", "播种标签");
    assert.ok(storageRaw()[accounts.registryKey("codex")], "注册表已写入 Storage");
    assert.equal(keychainRaw()["dashboard_kit_codex_token"], "legacy-tok", "遗留键未被改写");
}

// ── 执行 ───────────────────────────────────────────────────────
const tests: [string, () => Promise<void>][] = [
    ["DeepSeek 单账号(legacy)一致", testSingleLegacyDeepSeek],
    ["DeepSeek 多账号求和", testMultiAccountDeepSeek],
    ["DeepSeek 停用账号排除", testDisabledAccountExcluded],
    ["DeepSeek 全部失败", testAllAccountsFail],
    ["DeepSeek 部分失败", testPartialFailure],
    ["Codex 多账号求和+最低", testCodexMultiAccount],
    ["Codex 单账号一致", testCodexSingleAccountUnchanged],
    ["Antigravity 多账号", testAntigravityMultiAccount],
    ["WorkBuddy 直连多账号", testWbDirectMultiAccount],
    ["WorkBuddy 直连未配置", testWbDirectUnconfigured],
    ["直连拒绝非 JSON 响应", testWbDirectRejectsNonJson],
    ["直连拒绝缺 data/错误码/401", testWbDirectRejectsMissingData],
    ["直连成功后清空错误", testWbDirectSuccessClearsError],
    ["配置态判定", testConfiguredFlags],
    ["迁移播种注册表", testMigrationSeedsRegistry],
];

let passed = 0;
try {
    for (const [name, fn] of tests) {
        await fn();
        passed++;
        console.log(`  ok  ${name}`);
    }
    console.log(`PASS ${passed} data checks`);
} catch (error) {
    console.error(`FAIL after ${passed}/${tests.length} checks`);
    console.error((error as Error)?.stack || error);
    process.exitCode = 1;
}
