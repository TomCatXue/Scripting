// 油价调价日期文案回归：源站公示会滞后（调价已过、源站还写着上一轮日期），
// 卡片必须区分「未来调价」与「上一轮已调价」，否则会被读成「下次调价 10月15日」。
//
// 运行：node --import "./MutePanel/tests/register.mjs" "./MutePanel/tests/fuel_date.test.ts"
import assert from "node:assert/strict";
import { installGlobals, resetGlobals } from "./globals.ts";

installGlobals();

const data = await import("../data.ts");

// ── 1. 过期 / 未来判定（注入基准日期，保证不随真实时间漂移）────────
function testClassifyAdjustDate(): void {
    resetGlobals();
    const now = new Date(2026, 9, 16); // 2026-10-16

    assert.equal(
        data.classifyAdjustDate("10月15日24时", now),
        "past",
        "调价日已过（16 号看 15 号）判为 past"
    );
    assert.equal(
        data.classifyAdjustDate("10月16日", now),
        "future",
        "就是今天时不算过期（当天 24 时前仍算待调价）"
    );
    assert.equal(data.classifyAdjustDate("10月17日", now), "future", "明天为 future");
    assert.equal(data.classifyAdjustDate("10月27日", now), "future", "下一轮为 future");
    assert.equal(
        data.classifyAdjustDate("1月5日", now),
        "future",
        "跨年：10 月看 1 月 5 日属于下一年（应判 future，不能算成 9 个月前）"
    );
    assert.equal(
        data.classifyAdjustDate("1月5日", new Date(2026, 0, 10)),
        "past",
        "同一日期在 1 月 10 日看则是过去"
    );
    assert.equal(data.classifyAdjustDate("近期调价", now), "unknown", "解析不到日期时返回 unknown");
}

// ── 2. 日期压缩：只留「M月D日」，去掉年份与「24时」尾巴 ────────────
function testShortenAdjustDate(): void {
    assert.equal(data.shortenAdjustDate("10月15日24时"), "10月15日", "去掉 24 时");
    assert.equal(data.shortenAdjustDate("2026年10月15日"), "10月15日", "去掉年份");
    assert.equal(data.shortenAdjustDate("10月15日调整"), "10月15日", "去掉「调整」尾巴");
    assert.equal(data.shortenAdjustDate("近期调价"), "近期", "兜底为「近期」");
    assert.equal(data.shortenAdjustDate(""), "近期", "空值兜底");
}

const tests: [string, () => void][] = [
    ["调价日期过期/未来判定", testClassifyAdjustDate],
    ["调价日期压缩", testShortenAdjustDate],
];

let passed = 0;
for (const [name, fn] of tests) {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
}
console.log(`PASS ${passed} fuel date checks`);
