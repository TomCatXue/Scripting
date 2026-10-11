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

// ── 8. DeepSeek Token 曲线必须以「M（百万）」为单位 ────────────
// 回归：曾把原始 Token 数直接当 M 用，导致中号峰值显示 9863（应为 0.01M）。
async function testDeepSeekTokenUnitIsMillion(): Promise<void> {
    resetGlobals();
    keychainRaw()["dashboard_kit_deepseek_token"] = "web-token-abc";

    // 单日 9863 个 Token
    setMockFetch(async (req: any) => {
        const url = String(req?.url ?? req);
        if (url.includes("/users/get_user_summary")) {
            return {
                status: 200,
                ok: true,
                text: async () =>
                    JSON.stringify({
                        code: 0,
                        data: {
                            biz_data: {
                                normal_wallets: [{ balance: "10.00", currency: "CNY" }],
                                bonus_wallets: [],
                                total_costs: [{ amount: "100.00", currency: "CNY" }],
                            },
                        },
                    }),
            };
        }
        if (url.includes("/usage/by_api_key/cost")) {
            return { status: 200, ok: true, text: async () => JSON.stringify({ code: 0, data: { biz_data: { data: [] } } }) };
        }
        if (url.includes("/usage/by_api_key/amount")) {
            return {
                status: 200,
                ok: true,
                text: async () =>
                    JSON.stringify({
                        code: 0,
                        data: {
                            biz_data: {
                                series: [
                                    {
                                        buckets: [
                                            {
                                                time: Math.floor((Date.now() / 1000 + 28800) / 86400) * 86400 - 28800,
                                                usage: { RESPONSE_TOKEN: 9863, PROMPT_CACHE_HIT_TOKEN: 0, PROMPT_CACHE_MISS_TOKEN: 0 },
                                            },
                                        ],
                                    },
                                ],
                            },
                        },
                    }),
            };
        }
        return { status: 404, ok: false, text: async () => "{}" };
    });

    const r = await data.refreshDeepSeekData();
    assert.ok(r, "刷新成功");
    assert.ok(r.trends && Array.isArray(r.trends.tokens), "存在 tokens 走势");
    const today = r.trends.tokens[r.trends.tokens.length - 1].value;
    assert.equal(today, 0.01, "9863 Token 必须换算为 0.01M，而不是 9863");

    // 中号峰值标签必须显示 M 量级，而不是原始 Token 数
    // （peakLabel 位于 .tsx，无法 import；这里用同口径公式核对，并静态断言接线）
    const peakFormula = Math.round((9863 / 1e6) * 100) / 100;
    assert.equal(peakFormula, 0.01, "9863/1e6 取两位小数应为 0.01");
    assert.ok(
        src("../widget.tsx").includes('peakLabel(dsTrend, isBalance ? "" : "M"'),
        "中号 DeepSeek 峰值以 M 为单位传入"
    );
}

// ── 9. 油价：接入真实调价历史，由涨跌额回推价格曲线 ────────────
function testFuelRealAdjustHistory(): void {
    assert.ok(
        dataSrc.includes("fetchFuelAdjustHistory"),
        "存在真实调价历史抓取函数"
    );
    assert.ok(
        dataSrc.includes("http://www.qiyoujiage.com${tzPath}") &&
            dataSrc.includes("/^\\/tz\\/\\d{4}\\.shtml$/"),
        "抓取 qiyoujiage 的调价记录表（真实历史），并校验路径形态"
    );
    assert.ok(
        dataSrc.includes("/\\/tz\\/\\d{4}\\.shtml/"),
        "从省份页解析其自带的 /tz/<年>.shtml 链接（不自行推算年份，避免 404）"
    );
    assert.ok(
        dataSrc.includes("realHistory.length >= 2"),
        "优先使用真实调价历史，缺失时回落本地采样"
    );
    assert.ok(
        dataSrc.includes("price -= rows[i].delta / 1000"),
        "由元/吨的涨跌额回推元/升价格"
    );
}

// ── 10. WorkBuddy 合并为单一数据源 ────────────────────────────
function testWorkBuddyMergedSingleSource(): void {
    // 面板版实现必须彻底移除
    assert.ok(!dataSrc.includes("callWbPanel"), "面板版 callWbPanel 已移除");
    assert.ok(!dataSrc.includes("export function getWorkBuddyData"), "面板版读取函数已移除");
    assert.ok(!dataSrc.includes("export async function refreshWorkBuddyData"), "面板版刷新函数已移除");
    // 直连读取必须具备 App Group 文件回落（否则会显示 --）
    assert.ok(
        dataSrc.includes("WB_DIRECT_FILE_CACHE_PATH") &&
            /getWbDirectData[\s\S]*?FileManager.existsSync\(WB_DIRECT_FILE_CACHE_PATH\)/.test(dataSrc),
        "直连读取带文件回落，避免「有账号却显示 --」"
    );
    // 逐账号诊断
    assert.ok(
        dataSrc.includes("getWbDirectDiagnostics") && dataSrc.includes("noteDiag("),
        "直连刷新记录逐账号诊断，便于定位无数据原因"
    );
    // 选项注册只剩一个 workbuddy
    const typesSrc2 = src("../types.ts");
    assert.ok(!typesSrc2.includes('id: "workbuddy-direct"'), "WIDGET_OPTIONS 不再注册 workbuddy-direct");
}

// ── 11. 管理弹窗不得跨服务串台 ────────────────────────────────
function testManageAccountsNoCrossService(): void {
    const indexSrc = src("../index.tsx");
    const start = indexSrc.indexOf("async function manageAccounts");
    const end = indexSrc.indexOf("async function clearAllAccounts");
    const body = indexSrc.slice(start, end);

    assert.ok(start >= 0 && end > start, "定位到 manageAccounts 函数体");
    // 函数体内部不得出现任何具体服务的刷新/错误读取
    for (const forbidden of ["refreshWbDirectData", "getWbDirectLastError", "积分剩余"]) {
        assert.ok(
            !body.includes(forbidden),
            `manageAccounts 内不得写死「${forbidden}」（会导致点 Codex 管理却弹 WorkBuddy 结果）`
        );
    }
    // 每个服务都必须传入自己的 onTest
    for (const svc of ["deepseek", "codex", "antigravity", "workbuddy_direct"]) {
        assert.ok(
            indexSrc.includes(`manageAccounts(\n                  "${svc}"`) ||
                indexSrc.includes(`manageAccounts(\n                  '${svc}'`) ||
                new RegExp(`manageAccounts\\(\\s*"${svc}"`).test(indexSrc),
            `服务 ${svc} 的管理入口调用了 manageAccounts`
        );
    }
    for (const fn of [
        "testWbDirectConnection",
        "testDeepSeekConnection",
        "testCodexConnection",
        "testAntigravityConnection",
    ]) {
        assert.ok(indexSrc.includes(fn), `存在服务级测试连接实现 ${fn}`);
    }
}

// ── 12. 快照走势：首个快照之前回填首值，而不是填 0 ─────────────
// 回归：只填 0 会让新账号的中号图呈现「6 天贴 0 + 末日尖峰」，看起来像显示不全。
function testSnapshotSeriesBackfillsFirst(): void {
    resetGlobals();
    // 只在「今天」写入一个快照
    data.pushSnapshot("mutepanel_test_backfill_key", 42);
    const series = data.snapshotSeries("mutepanel_test_backfill_key", 7);
    assert.equal(series.length, 7, "恒定 7 点");
    const all42 = series.every((p: any) => p.value === 42);
    assert.ok(all42, `首个快照之前应回填首值 42，而不是 0：${JSON.stringify(series.map((p: any) => p.value))}`);
    assert.ok(
        !series.slice(0, -1).some((p: any) => p.value === 0),
        "不得出现「前 6 天贴 0」的误导性走势"
    );
}

// ── 13. 油价真实调价历史：由涨跌额回推出上下波动的折线 ─────────
async function testFuelRealHistoryDerived(): Promise<void> {
    resetGlobals();
    storageRaw()["dashboard_kit_fuel_province"] = "北京";
    storageRaw()["dashboard_kit_fuel_oil"] = "oil92";

    const provinceHtml =
        '<dd>7.88</dd><dd>8.39</dd><dd>9.89</dd><dd>7.59</dd>' +
        '<a href="/tz/2025.shtml">历史油价</a>';
    // /tz/2025.shtml 承载「上一年」记录；链接 2025 → 数据年 2026（升序后）
    const tzHtml =
        "<table>" +
        "<tr><th>调价时间</th><th>汽油(元/吨)</th><th>柴油(元/吨)</th></tr>" +
        "<tr><td>2026年1月16日</td><td>跌200</td><td>跌200</td></tr>" +
        "<tr><td>2026年1月2日</td><td>涨100</td><td>涨100</td></tr>" +
        "</table>";

    setMockFetch(async (req: any) => {
        const url = String(req?.url ?? req);
        return {
            status: 200,
            ok: true,
            text: async () => (url.includes("/tz/") ? tzHtml : provinceHtml),
        };
    });

    const r = await data.refreshFuelData();
    assert.ok(r, "刷新成功");
    const hist = r.priceHistory;
    assert.ok(Array.isArray(hist) && hist.length >= 2, `真实历史应至少 2 点，实际 ${hist?.length}`);

    // 必须呈现真实波动，而不是一条水平直线
    const values = hist.map((h: any) => Number(h.value));
    const distinct = new Set(values);
    assert.ok(distinct.size >= 2, `走势应有真实波动（值不全相同）：${JSON.stringify(values)}`);

    // 回推口径核对：每个调价日的值 = 该日调价后的挂牌价。
    // 1/16 跌 200 元/吨 → 当前价 7.88；则 1/2（涨 100）之后、1/16 之前为 7.88+0.20=8.08，
    // 即 1/2 当日的挂牌价应为 8.08，随后 1/16 跌至 7.88。
    const first = hist[0];
    assert.equal(first.value, 8.08, `首点应为 1/2 调价后的挂牌价 8.08，实际 ${first.value}`);

    // 末点必须是当前挂牌价
    assert.equal(hist[hist.length - 1].value, 7.88, "末点为当前挂牌价");
}

// ── 14. 预览不再被慢网络拖住（限时等待 + 缓存兜底）────────────
async function testPreviewBoundedWait(): Promise<void> {
    // withTimeout：超时返回 null，不阻塞界面
    const slow = new Promise<number>((resolve) => setTimeout(() => resolve(1), 200));
    const t0 = Date.now();
    const got = await data.withTimeout(slow, 30);
    const elapsed = Date.now() - t0;
    assert.equal(got, null, "超时后返回 null（用缓存出图）");
    assert.ok(elapsed < 150, `应在超时上限附近返回，实际 ${elapsed}ms`);

    // 正常返回时原样透传
    assert.equal(await data.withTimeout(Promise.resolve(7), 500), 7, "未超时则透传结果");
    // 抛错不冒泡
    assert.equal(await data.withTimeout(Promise.reject(new Error("x")), 500), null, "错误被吞并返回 null");

    const indexSrc = src("../index.tsx");
    assert.ok(indexSrc.includes("withTimeout(prep,"), "预览数据准备使用限时等待");
    assert.ok(indexSrc.includes("const prep = (() =>"), "预览数据准备集中为一处，避免每次改动漏改");
}

// ── 15. 预览激活 ID 必须带时间戳且会过期 ──────────────────────
function testPreviewActiveIsTimeBounded(): void {
    const widgetSrc = src("../widget.tsx");
    assert.ok(
        widgetSrc.includes("PREVIEW_ACTIVE_TTL_MS"),
        "定义了预览激活 ID 的有效期"
    );
    assert.ok(
        widgetSrc.includes("Date.now() - ts <= PREVIEW_ACTIVE_TTL_MS"),
        "读取时校验时间戳，过期即忽略"
    );
    assert.ok(
        widgetSrc.includes("function readActivePreviewId"),
        "统一由 readActivePreviewId 读取（getWidgetView 与 main 共用）"
    );
    // 旧的「纯字符串无条件回落」必须消失（否则会长期劫持所有组件）
    assert.ok(
        !widgetSrc.includes('Storage.get<string>("dashboard_kit_preview_active_id"'),
        "不再以纯字符串形式无条件回落预览 ID"
    );
    // 写入侧带时间戳
    const indexSrc = src("../index.tsx");
    assert.ok(
        indexSrc.includes("{ id: opt.id, at: Date.now() }"),
        "预览时写入带时间戳的激活 ID"
    );
}

// ── 18. 分发配置：remoteResource 补齐且指向仓库，版本提升至 1.3.0 ─────
function testDistributionAndRemoteResource(): void {
    const scriptJsonRaw = src("../script.json");
    const scriptJson = JSON.parse(scriptJsonRaw);
    assert.ok(
        scriptJson.remoteResource && typeof scriptJson.remoteResource === "object",
        "script.json 必须配置 remoteResource 对象，否则真机无法从 GitHub 获取更新"
    );
    assert.equal(
        scriptJson.remoteResource.url,
        "https://github.com/TomCatXue/Scripting/tree/main/MutePanel",
        "remoteResource.url 指向仓库 MutePanel 目录"
    );
    assert.ok(
        scriptJson.version >= "1.3.0",
        "版本号提升至 1.3.0 或更高"
    );
}

// ── 19. 小组件生命周期：导入 Script，标准 reloadPolicy，调用 Script.exit ──
function testWidgetLifecycleAndReloadPolicy(): void {
    const widgetSrc = src("../widget.tsx");
    assert.ok(
        /import\s*\{[^}]*?\bScript\b[^}]*?\}\s*from\s*"scripting"/.test(widgetSrc),
        "widget.tsx 必须导入 Script"
    );
    assert.ok(
        widgetSrc.includes("reloadPolicy:") &&
            /reloadPolicy:\s*\{\s*policy:\s*"after"/.test(widgetSrc),
        "Widget.present 传入标准嵌套 reloadPolicy 对象"
    );
    assert.ok(
        widgetSrc.includes("Script.exit()"),
        "widget.tsx 必须在最后调用 Script.exit()，否则 iOS 扩展进程挂起"
    );
}

// ── 20. 多账号跨进程共享：文件级双通道写入与回落 ─────────────────────
function testAccountsFileDualChannel(): void {
    const accountsSrc = src("../accounts.ts");
    assert.ok(
        accountsSrc.includes("FileManager.appGroupDocumentsDirectory"),
        "accounts.ts 包含 App Group 文件路径生成"
    );
    assert.ok(
        accountsSrc.includes("FileManager.writeAsStringSync") &&
            accountsSrc.includes("FileManager.readAsStringSync"),
        "accounts.ts 读写注册表同时支持 FileManager 双通道"
    );
}

// ── 21. 缓存检测 API 严谨性：使用 existsSync ─────────────────────────
function testDataExistsSyncUsage(): void {
    const dSrc = src("../data.ts");
    assert.ok(
        !dSrc.includes("FileManager.fileExists("),
        "data.ts 不得裸调未标准化的 FileManager.fileExists"
    );
    assert.ok(
        dSrc.includes("FileManager.existsSync(GITHUB_FILE_CACHE_PATH)") ||
            dSrc.includes("FileManager.existsSync ? FileManager.existsSync(GITHUB_FILE_CACHE_PATH)"),
        "GitHub 缓存使用 existsSync 探测"
    );
    assert.ok(
        dSrc.includes("FileManager.existsSync(LOON_FILE_CACHE_PATH)") ||
            dSrc.includes("FileManager.existsSync ? FileManager.existsSync(LOON_FILE_CACHE_PATH)"),
        "Loon 缓存使用 existsSync 探测"
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
    ["DeepSeek Token 单位为 M", testDeepSeekTokenUnitIsMillion],
    ["油价接入真实调价历史", testFuelRealAdjustHistory],
    ["WorkBuddy 单一数据源", testWorkBuddyMergedSingleSource],
    ["管理弹窗不跨服务串台", testManageAccountsNoCrossService],
    ["快照走势回填首值", testSnapshotSeriesBackfillsFirst],
    ["油价真实调价历史回推", testFuelRealHistoryDerived],
    ["预览限时等待不卡顿", testPreviewBoundedWait],
    ["预览激活 ID 有有效期", testPreviewActiveIsTimeBounded],
    ["分发配置与 remoteResource 补齐", testDistributionAndRemoteResource],
    ["小组件生命周期与 reloadPolicy 标准化", testWidgetLifecycleAndReloadPolicy],
    ["多账号 App Group 文件双通道", testAccountsFileDualChannel],
    ["缓存存在性使用 existsSync", testDataExistsSyncUsage],
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
