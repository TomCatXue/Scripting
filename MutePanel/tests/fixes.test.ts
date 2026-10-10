// 回归测试：本轮声称修复但实际未落地的三处问题。
//
// 这些断言针对的是「总结说改了、代码里没有」的情况，因此直接检查实现。
// 运行：node --import "./MutePanel/tests/register.mjs" "./MutePanel/tests/fixes.test.ts"
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installGlobals, resetGlobals, storageRaw, keychainRaw } from "./globals.ts";
import { setMockFetch } from "./scripting.mock.ts";

installGlobals();

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const templatesSrc = src("../templates.tsx");
const cardsSrc = src("../cards.tsx");
const dataSrc = src("../data.ts");

const data = await import("../data.ts");

// ── 1. AI 中号：坐标轴隐藏 + 独立日期行 ───────────────────────
function testWaveformAxesHidden(): void {
    // 取出 WaveformMediumTemplate 的函数体
    const start = templatesSrc.indexOf("export function WaveformMediumTemplate");
    const end = templatesSrc.indexOf("\n}", start);
    const body = templatesSrc.slice(start, end);

    assert.ok(
        body.includes('chartXAxis="hidden"'),
        "波形图中号必须隐藏 X 轴（原生轴无左右内边距，首尾刻度会被截断）"
    );
    // 参考实现（xubai2001「DeepSeek 用量」）用系统自动 Y 轴，
    // 因此这里**不应**设置 chartYAxis —— 与参考及改造前行为一致。
    assert.ok(
        !body.includes("chartYAxis"),
        "不应设置 chartYAxis，保持与参考实现一致的系统自动 Y 轴"
    );
    // 不应再配置原生刻度值（截断根因）。
    // 注意：注释里会提到 multiLabelAlignment 说明原因，因此这里针对
    // 实际的原生轴配置对象，而不是关键词本身。
    assert.ok(
        !body.includes('values: { type: "values"'),
        "不应再向原生图表传刻度值配置（这正是截断根因）"
    );
    assert.ok(
        !/chartXAxis=\{\{/.test(body),
        "chartXAxis 不应再传对象配置"
    );
    // 图表高度与参考一致为 80
    assert.ok(
        body.includes("height: 80"),
        "图表高度应为 80pt（对齐参考实现）"
    );
    // 绘图区裁切，与参考一致
    assert.ok(
        body.includes("ChartPlotStyle"),
        "应使用 ChartPlotStyle 裁切绘图区"
    );
}

function testWaveformOwnDateRow(): void {
    const start = templatesSrc.indexOf("export function WaveformMediumTemplate");
    const end = templatesSrc.indexOf("\n}", start);
    const body = templatesSrc.slice(start, end);

    assert.ok(
        body.includes("axisValues.flatMap"),
        "图表下方必须有独立渲染的日期行（用布局保证完整显示）"
    );
    assert.ok(
        /padding=\{\{\s*top:\s*2,\s*trailing:\s*12/.test(body),
        "日期行内边距与参考实现一致（top 2 / trailing 12）"
    );
    // 三个日期之间插入 Spacer 实现等距分布。
    // 源码里只有一处 Spacer 模板，运行时由 flatMap 对 i>0 的项各产生一个
    // （3 个日期 → 2 个 Spacer），所以这里断言的是插入逻辑而非出现次数。
    assert.ok(
        /return i === 0 \? \[node\] : \[<Spacer/.test(body),
        "除首个日期外，每项前插入 Spacer 实现等距分布"
    );
    assert.ok(
        body.includes("axisValues.flatMap"),
        "日期行由 flatMap 展开"
    );
}

// ── 2. modeSwitch 插槽必须被模板接收 ──────────────────────────
function testModeSwitchSlotWired(): void {
    // 类型声明必须有该字段，否则 widget 传了也会被静默丢弃
    const propsStart = templatesSrc.indexOf("export interface WaveformMediumTemplateProps");
    const propsEnd = templatesSrc.indexOf("\n}", propsStart);
    const propsBody = templatesSrc.slice(propsStart, propsEnd);

    assert.ok(
        propsBody.includes("modeSwitch"),
        "WaveformMediumTemplateProps 必须声明 modeSwitch，否则传参会被静默丢弃"
    );

    // 模板必须实际渲染它
    const fnStart = templatesSrc.indexOf("export function WaveformMediumTemplate");
    const fnEnd = templatesSrc.indexOf("\n}", fnStart);
    const fnBody = templatesSrc.slice(fnStart, fnEnd);
    assert.ok(
        fnBody.includes("props.modeSwitch"),
        "模板必须渲染 props.modeSwitch"
    );

    // widget 侧确实传了
    const widgetSrc = src("../widget.tsx");
    assert.ok(widgetSrc.includes("modeSwitch: modeSwitchNode"), "widget 向中号模板注入 modeSwitch");
}

// ── 3. 油价：按自然日 upsert，不再压缩历史 ────────────────────
function testFuelHistoryUpsert(): void {
    // 关键回归：早期实现是「价格不变时替换最后一个点」，
    // 会把历史压缩成单点，导致走势图退化为直线。
    assert.ok(
        dataSrc.includes("history[todayIdx] = { label: todayLabel, value: focusNum }"),
        "同一天应覆盖（upsert），而不是无条件替换最后一个点"
    );
    assert.ok(
        dataSrc.includes("history.push({ label: todayLabel, value: focusNum })"),
        "新的一天应追加新采样点"
    );
    assert.ok(
        !dataSrc.includes("history[history.length - 1] = { label: todayLabel, value: focusNum }"),
        "不得再出现「替换最后一个点」的写法（会压缩历史）"
    );
    // 日期格式与 recentDays 一致（紧凑 月/日）
    assert.ok(
        dataSrc.includes("`${now.getMonth() + 1}/${now.getDate()}`"),
        "采样日期用紧凑的 月/日 格式"
    );
}

// ── 4. 单点不画线（小号行情模板）──────────────────────────────
function testTrendSmallDegrades(): void {
    const start = templatesSrc.indexOf("export function TrendSmallTemplate");
    const end = templatesSrc.indexOf("\n}", start);
    const body = templatesSrc.slice(start, end);

    assert.ok(
        body.includes("const hasTrend = info.length >= 2"),
        "小号行情模板需判断点数是否足够"
    );
    assert.ok(
        body.includes("{hasTrend ? ("),
        "点数不足时不得渲染折线"
    );
    assert.ok(
        body.includes("累积走势中"),
        "点数不足时显示说明文案"
    );
}

// ── 5. 油价小号卡不喂单点给模板 ───────────────────────────────
function testFuelSmallCardHonest(): void {
    const start = cardsSrc.indexOf("export function FuelPriceSmallCard");
    const end = cardsSrc.indexOf("\n}", start);
    const body = cardsSrc.slice(start, end);

    assert.ok(
        body.includes("const hasTrend = history.length >= 2"),
        "油价小号卡需判断历史是否足够"
    );
    assert.ok(
        body.includes("data={hasTrend ? history : []}"),
        "历史不足时传空数组，让模板降级，而不是传单点画直线"
    );
    assert.ok(
        !body.includes('{ label: "当前", value: current }'),
        "不得再用「当前」单点兜底（会渲染成误导性的水平直线）"
    );
}

// ── 6. 油价历史累积的行为验证（跨天追加、同日覆盖）────────────
async function testFuelHistoryAccumulates(): Promise<void> {
    resetGlobals();
    storageRaw()["dashboard_kit_fuel_province"] = "北京";
    storageRaw()["dashboard_kit_fuel_oil"] = "oil92";

    // 站点返回固定价，模拟「价格不变」
    setMockFetch(async () => ({
        status: 200,
        ok: true,
        text: async () => "<dd>7.88</dd><dd>8.39</dd><dd>9.89</dd><dd>7.59</dd>",
    }));

    // 第一天采样
    const day1 = await data.refreshFuelData();
    assert.ok(day1, "首次刷新成功");
    assert.equal(day1.priceHistory.length, 1, "首次只产生 1 个采样点");

    // 同一天再刷新：应覆盖而非追加
    const day1b = await data.refreshFuelData();
    assert.equal(day1b.priceHistory.length, 1, "同一天重复刷新不增加采样点");

    // 伪造一个「昨天」的采样点，模拟跨天
    const cached = storageRaw()["dashboard_kit_fuel_cache_v1"];
    cached.priceHistory = [{ label: "10/8", value: 7.88 }];
    const day2 = await data.refreshFuelData();
    assert.equal(day2.priceHistory.length, 2, "跨天后追加新采样点（关键回归点）");
    assert.equal(day2.priceHistory[0].label, "10/8", "保留历史日");
}

// ── 7. Antigravity 切换后图表数据真正变化 ─────────────────────
async function testAntigravityPerModeTrends(): Promise<void> {
    resetGlobals();
    // 凭据在 Keychain，不在 Storage
    keychainRaw()["dashboard_kit_antigravity_token"] = "ag-a";

    setMockFetch(async () => ({
        status: 200,
        ok: true,
        text: async () =>
            JSON.stringify({
                groups: [
                    {
                        buckets: [
                            { bucketId: "gemini-5h", remainingFraction: 0.9, resetTime: Date.now() + 3600_000 },
                            { bucketId: "gemini-week", remainingFraction: 0.8 },
                            { bucketId: "3p-5h", remainingFraction: 0.4, resetTime: Date.now() + 7200_000 },
                            { bucketId: "3p-week", remainingFraction: 0.9 },
                        ],
                    },
                ],
            }),
    }));

    const r = await data.refreshAntigravityData();
    assert.ok(r, "Antigravity 刷新成功");

    // 分模式走势必须存在，且两条不相同 —— 否则切换只是换配色
    assert.ok(r.trends, "输出包含分模式走势 trends");
    assert.ok(Array.isArray(r.trends.gemini), "含 gemini 走势");
    assert.ok(Array.isArray(r.trends.claude), "含 claude 走势");

    const gemLast = r.trends.gemini[r.trends.gemini.length - 1].value;
    const claudeLast = r.trends.claude[r.trends.claude.length - 1].value;
    assert.equal(gemLast, 90, "gemini 走势末值为 Gemini 额度");
    assert.equal(claudeLast, 40, "claude 走势末值为 Claude 额度");
    assert.notEqual(gemLast, claudeLast, "两条走势数据不同（切换才有意义）");
}

function testWidgetConsumesModeTrend(): void {
    const widgetSrc = src("../widget.tsx");
    assert.ok(
        widgetSrc.includes('d.trends?.[isClaude ? "claude" : "gemini"]'),
        "widget 按当前模式选取对应走势"
    );
    assert.ok(
        widgetSrc.includes("trendData: modeTrend"),
        "图表数据来自按模式选取的走势，而非固定 trend7d"
    );
    // 三个走势键必须彼此独立，否则会互相覆盖
    assert.ok(
        dataSrc.includes('TREND_KEY_ANTIGRAVITY_GEMINI = "mutepanel_trend_antigravity_gemini_v1"'),
        "Gemini 走势独立键"
    );
    assert.ok(
        dataSrc.includes('TREND_KEY_ANTIGRAVITY_CLAUDE = "mutepanel_trend_antigravity_claude_v1"'),
        "Claude 走势独立键"
    );
}

// ── 执行 ───────────────────────────────────────────────────────
const tests: [string, () => void | Promise<void>][] = [
    ["波形图中号隐藏坐标轴", testWaveformAxesHidden],
    ["波形图独立日期行", testWaveformOwnDateRow],
    ["modeSwitch 插槽已接通", testModeSwitchSlotWired],
    ["油价按日 upsert", testFuelHistoryUpsert],
    ["单点不画线（模板）", testTrendSmallDegrades],
    ["油价小号卡降级", testFuelSmallCardHonest],
    ["油价历史累积行为", testFuelHistoryAccumulates],
    ["Antigravity 分模式走势", testAntigravityPerModeTrends],
    ["widget 消费分模式走势", testWidgetConsumesModeTrend],
];

let passed = 0;
try {
    for (const [name, fn] of tests) {
        await fn();
        passed++;
        console.log(`  ok  ${name}`);
    }
    console.log(`PASS ${passed} fix checks`);
} catch (error) {
    console.error(`FAIL after ${passed}/${tests.length} checks`);
    console.error((error as Error)?.stack || error);
    process.exitCode = 1;
}
