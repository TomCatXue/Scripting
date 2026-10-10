// 聚合纯函数测试（无 IO，不需要全局桩）。
// 运行：node --import "./MutePanel/tests/register.mjs" "./MutePanel/tests/aggregate.test.ts"
import assert from "node:assert/strict";

const {
  aggregateQuota,
  aggregateSum,
  averagePct,
  mergeDayCosts,
  accountNote,
  dominantCurrency,
  currencySymbol,
} = await import("../aggregate.ts");

// ── 1. 百分比配额：求和 + 最低 ─────────────────────────────────
function testAggregateQuota(): void {
    // 两个账号 83% / 41% 的 5 小时额度
    const r = aggregateQuota([
        { pct1: 83, pct2: 0 },
        { pct1: 41, pct2: 12 },
    ]);
    assert.equal(r.sum1, 124, "主指标求和");
    assert.equal(r.sum2, 12, "次指标求和");
    assert.equal(r.lowest, 41, "lowest 只看主指标（与 sum1 同口径）");
    assert.equal(r.lowestAny, 0, "lowestAny 覆盖两个指标，取到 0");
    assert.equal(r.count, 2, "账号数");
    assert.ok(r.note.includes("2 账号"), "标注含账号数");
    assert.ok(r.note.includes("最低 41.0%"), `标注含主指标最低值，实际: ${r.note}`);
}

function testAggregateQuotaLowest(): void {
    // 主指标才是求和对象，最低也必须取主指标，否则与求和不可比
    const r = aggregateQuota([
        { pct1: 90, pct2: 80 },
        { pct1: 55, pct2: 41 },
    ]);
    assert.equal(r.lowest, 55, "lowest 取主指标跨账号最小值");
    assert.equal(r.lowestAny, 41, "lowestAny 取任意指标最小值");
    assert.ok(r.note.includes("55.0%"), `标注用主指标最低值，实际: ${r.note}`);
}

function testAggregateQuotaEmpty(): void {
    const r = aggregateQuota([]);
    assert.equal(r.count, 0, "空输入账号数为 0");
    assert.equal(r.sum1, 0, "空输入求和为 0");
    assert.equal(r.note, "", "空输入无标注");
}

function testAggregateQuotaIgnoresGarbage(): void {
    const r = aggregateQuota([
        { pct1: 50, pct2: 50 },
        { pct1: NaN, pct2: 0 } as any,
        null as any,
        { pct1: 30, pct2: 10 },
    ]);
    assert.equal(r.count, 2, "过滤 NaN 与 null 项");
    assert.equal(r.sum1, 80, "只累加有效项");
    assert.equal(r.lowest, 30, "主指标最低只看有效项");
}

// ── 2. 求和聚合 ────────────────────────────────────────────────
function testAggregateSum(): void {
    assert.equal(aggregateSum([1.5, 2.25, 3]).sum, 6.75, "小数求和");
    assert.equal(aggregateSum([]).sum, 0, "空求和为 0");
    assert.equal(aggregateSum([1, NaN, 2] as any).sum, 3, "跳过非数值");
    assert.equal(aggregateSum([1, 2]).count, 2, "统计有效项数");
}

// ── 3. 平均百分比（进度槽用，恒在 0–100）──────────────────────
function testAveragePct(): void {
    assert.equal(averagePct([83, 41]), 62, "两账号平均");
    assert.equal(averagePct([100, 100, 100]), 100, "全满为 100");
    assert.equal(averagePct([]), 0, "空为 0");
    // 关键：多账号求和不超 100 的钳制目标
    assert.equal(averagePct([83, 83]), 83, "相同值平均后仍为原值");
    assert.ok(averagePct([200, 200]) <= 100, "异常大值被钳制在 100");
}

// ── 4. 逐日消费合并（DeepSeek 真实历史）───────────────────────
function testMergeDayCosts(): void {
    const a = new Map<number, number>([[100, 1.5], [200, 2.0]]);
    const b = new Map<number, number>([[100, 0.5], [300, 4.0]]);
    const merged = mergeDayCosts([a, b]);

    assert.equal(merged.get(100), 2.0, "同一天相加");
    assert.equal(merged.get(200), 2.0, "仅 A 有的天保留");
    assert.equal(merged.get(300), 4.0, "仅 B 有的天保留");
    assert.equal(merged.size, 3, "合并后共 3 天");
}

function testMergeDayCostsEdge(): void {
    assert.equal(mergeDayCosts([]).size, 0, "空输入");
    const single = mergeDayCosts([new Map([[1, 5]])]);
    assert.equal(single.get(1), 5, "单账号透传数值");
}

// ── 5. 标注文案 ────────────────────────────────────────────────
function testAccountNote(): void {
    assert.equal(accountNote(0, 0), "", "0 账号无标注");
    assert.equal(accountNote(2, 2), "2 账号", "全部在线只报账号数");
    assert.equal(accountNote(3, 1), "3 账号 · 可用 1/3", "部分失败标注可用数");
    assert.equal(accountNote(2, 2, 41), "2 账号 · 最低 41.0%", "带最低值");
    assert.equal(accountNote(3, 2, 5.5), "3 账号 · 最低 5.5% · 可用 2/3", "三者齐全");
}

// ── 6. 币种处理 ────────────────────────────────────────────────
function testCurrency(): void {
    assert.equal(dominantCurrency(["CNY", "CNY", "USD"]), "CNY", "取多数币种");
    assert.equal(dominantCurrency(["USD", "USD"]), "USD", "全 USD");
    assert.equal(dominantCurrency([]), "CNY", "空输入回落 CNY");
    assert.equal(currencySymbol("USD"), "$", "USD 符号");
    assert.equal(currencySymbol("CNY"), "¥", "CNY 符号");
    assert.equal(currencySymbol("EUR"), "€", "EUR 符号");
    assert.equal(currencySymbol(""), "¥", "未知回落 ¥");
}

// ── 执行 ───────────────────────────────────────────────────────
const tests: [string, () => void][] = [
    ["配额聚合：求和", testAggregateQuota],
    ["配额聚合：最低", testAggregateQuotaLowest],
    ["配额聚合：空输入", testAggregateQuotaEmpty],
    ["配额聚合：过滤脏数据", testAggregateQuotaIgnoresGarbage],
    ["求和聚合", testAggregateSum],
    ["平均百分比钳制", testAveragePct],
    ["逐日消费合并", testMergeDayCosts],
    ["逐日合并边界", testMergeDayCostsEdge],
    ["账号标注文案", testAccountNote],
    ["币种处理", testCurrency],
];

let passed = 0;
try {
    for (const [name, fn] of tests) {
        fn();
        passed++;
        console.log(`  ok  ${name}`);
    }
    console.log(`PASS ${passed} aggregate checks`);
} catch (error) {
    console.error(`FAIL after ${passed}/${tests.length} checks`);
    console.error((error as Error)?.stack || error);
    process.exitCode = 1;
}
