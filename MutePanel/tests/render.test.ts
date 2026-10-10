// 源码断言：路由顺序与 UI 接线。
// 这类问题（参数被子串抢先匹配、卡片漏钳制）静态阅读不易发现，
// 用断言把它们钉住，避免后续回归。
// 运行：node --import "./MutePanel/tests/register.mjs" "./MutePanel/tests/render.test.ts"
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const widgetSrc = src("../widget.tsx");
const cardsSrc = src("../cards.tsx");
const indexSrc = src("../index.tsx");
const typesSrc = src("../types.ts");
const intentsSrc = src("../app_intents.tsx");
const templatesSrc = src("../templates.tsx");

// ── 1. 参数路由：workbuddy-direct 必须排在 workbuddy 之前 ────────
function testParamOrderInGetWidgetView(): void {
    const directAt = widgetSrc.indexOf('target.includes("workbuddy-direct")');
    const panelAt = widgetSrc.indexOf('target.includes("workbuddy") || target === "wb"');

    assert.ok(directAt >= 0, "getWidgetView 中存在 workbuddy-direct 分支");
    assert.ok(panelAt >= 0, "getWidgetView 中存在 workbuddy 面板分支");
    assert.ok(
        directAt < panelAt,
        "workbuddy-direct 必须排在 workbuddy 之前，否则会被子串抢先匹配"
    );
}

function testParamOrderInMain(): void {
    const directAt = widgetSrc.indexOf('p.includes("workbuddy-direct")');
    const panelAt = widgetSrc.indexOf('p.includes("workbuddy") || p === "wb"');

    assert.ok(directAt >= 0, "main() 刷新分发中存在 workbuddy-direct 分支");
    assert.ok(panelAt >= 0, "main() 刷新分发中存在 workbuddy 面板分支");
    assert.ok(directAt < panelAt, "main() 中 workbuddy-direct 也必须排在 workbuddy 之前");
}

// ── 2. 默认服务选择：面板版优先于直连版（老用户默认不变）──────
function testPickDefaultOrder(): void {
    const wbAt = widgetSrc.indexOf('["workbuddy", hasWbConfigured()]');
    const wbdAt = widgetSrc.indexOf('["workbuddy-direct", hasWbDirectConfigured()]');
    assert.ok(wbAt >= 0 && wbdAt >= 0, "pickDefaultService 同时包含两个 WorkBuddy 条目");
    assert.ok(wbAt < wbdAt, "面板版排在直连版之前，保持老用户默认看板不变");
}

// ── 3. 渲染分支齐全 ────────────────────────────────────────────
function testRenderBranches(): void {
    assert.ok(
        widgetSrc.includes('mService === "workbuddy-direct"'),
        "中号渲染存在 workbuddy-direct 分支"
    );
    assert.ok(
        widgetSrc.includes('sService === "workbuddy-direct"'),
        "小号渲染存在 workbuddy-direct 分支"
    );
    assert.ok(
        widgetSrc.includes("getWbDirectData"),
        "widget 读取直连数据"
    );
}

// ── 4. 进度槽钳制（多账号求和会超过 100）─────────────────────
function testProgressClamped(): void {
    assert.ok(
        cardsSrc.includes("Math.min(100, fiveHourPct)"),
        "Codex 小号卡进度槽钳制到 100"
    );
    assert.ok(
        cardsSrc.includes("Math.max(0, Math.min(100, data.progressPct"),
        "WorkBuddy 小号卡进度槽钳制到 100"
    );
}

// ── 5. 卡片支持直连版的标签差异 ────────────────────────────────
function testWorkBuddyCardDynamicLabels(): void {
    assert.ok(
        cardsSrc.includes('data.serviceId === "workbuddy-direct"'),
        "WorkBuddy 小号卡识别直连版"
    );
    assert.ok(
        cardsSrc.includes("data.subLabel1"),
        "第三格标签由数据层给出（面板版「已签」/ 直连版「账号」）"
    );
}

// ── 6. 类型与选项注册 ─────────────────────────────────────────
function testTypesRegistered(): void {
    assert.ok(
        typesSrc.includes('"workbuddy-direct"'),
        "MetricBalanceData.serviceId 联合类型包含 workbuddy-direct"
    );
    assert.ok(
        typesSrc.includes('id: "workbuddy-direct"'),
        "WIDGET_OPTIONS 注册了 workbuddy-direct"
    );
    assert.ok(
        typesSrc.includes("DEFAULT_WORKBUDDY_DIRECT"),
        "定义了直连版默认数据"
    );
}

// ── 7. AppIntent 覆盖直连刷新 ─────────────────────────────────
function testAppIntentCoversDirect(): void {
    assert.ok(
        intentsSrc.includes("refreshWbDirectData"),
        "统一刷新 Intent 覆盖 WorkBuddy 直连"
    );
}

// ── 8. 配置入口与清除路径 ─────────────────────────────────────
function testConfigWiring(): void {
    assert.ok(indexSrc.includes("configureWbDirect"), "存在直连凭据录入流程");
    assert.ok(indexSrc.includes("manageAccounts"), "存在账号管理入口");
    assert.ok(indexSrc.includes("clearAllAccounts"), "存在清除全部账号的路径");
    assert.ok(
        indexSrc.includes('opt.id === "workbuddy-direct"'),
        "预览前会刷新直连数据"
    );
    assert.ok(
        indexSrc.includes('id === "workbuddy" || id === "workbuddy-direct"'),
        "OptionBrandIcon 覆盖直连版"
    );
}

// ── 9. 直连版不复用面板缓存键 ─────────────────────────────────
function testDirectUsesOwnCache(): void {
    const dataSrc = readFileSync(new URL("../data.ts", import.meta.url), "utf8");
    assert.ok(
        dataSrc.includes('WB_DIRECT_CACHE_KEY = "dashboard_kit_wb_direct_cache_v1"'),
        "直连版有独立缓存键"
    );
    assert.ok(
        dataSrc.includes('TREND_KEY_WB_DIRECT = "mutepanel_trend_wb_direct_v1"'),
        "直连版有独立走势键"
    );
    assert.notEqual(
        dataSrc.indexOf('WB_DIRECT_CACHE_KEY = "dashboard_kit_wb_direct_cache_v1"'),
        -1,
        "缓存键不与面板版共用"
    );
}

// ── 10. 用到的 scripting 组件必须已导入 ───────────────────────
// 这类问题语法检查抓不到：`@ts-nocheck` 关掉了类型检查，
// 组件未导入时在真机上渲染为空白/报错。ModeSwitch 曾漏导入 Button。
function testScriptingComponentsImported(): void {
    const UI_COMPONENTS = [
        "Button", "Chart", "ChartPlotStyle", "AreaChart", "LineChart", "BarChart",
        "HStack", "VStack", "ZStack", "Spacer", "Text", "Image", "SVG", "Path",
        "Link", "List", "Section", "Toggle", "Gauge", "Divider", "Rectangle",
        "Circle", "RoundedRectangle", "Color",
    ];

    const files = ["../templates.tsx", "../cards.tsx", "../widget.tsx"];
    const problems: string[] = [];

    for (const rel of files) {
        const text = src(rel);

        // 收集该文件从 "scripting" 导入的名字
        const importMatch = text.match(/import\s*\{([\s\S]*?)\}\s*from\s*"scripting"/);
        const imported = new Set(
            (importMatch?.[1] || "")
                .split(",")
                .map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()!.trim())
                .filter(Boolean)
        );

        // 收集该文件里实际以 JSX 形式使用的组件名
        const used = new Set<string>();
        const tagRe = /<([A-Z][A-Za-z0-9]*)[\s/>]/g;
        let m: RegExpExecArray | null;
        while ((m = tagRe.exec(text)) !== null) used.add(m[1]);

        for (const name of used) {
            if (!UI_COMPONENTS.includes(name)) continue; // 本地组件或未列出的 API
            if (!imported.has(name)) problems.push(`${rel} 使用了 <${name}> 但未从 "scripting" 导入`);
        }
    }

    assert.deepEqual(problems, [], `存在未导入的组件:\n  ${problems.join("\n  ")}`);
}

// ── 11. 中号模板与参考实现的版式关键点 ────────────────────────
function testMediumMatchesReference(): void {
    const start = templatesSrc.indexOf("export function WaveformMediumTemplate");
    const end = templatesSrc.indexOf("\n}", start);
    const body = templatesSrc.slice(start, end);

    // 左侧 112pt 固定栏（参考 MediumView）
    assert.ok(body.includes("width: 112"), "左侧栏固定 112pt");
    // 标题居中，胶囊在其右侧同一行
    assert.ok(
        /frame=\{\{ maxWidth: "infinity", alignment: "center" \}\}/.test(body),
        "图表标题居中"
    );
    assert.ok(
        body.includes("{props.modeSwitch ? props.modeSwitch : null}"),
        "模式切换胶囊位于标题行右侧（与参考一致）"
    );
    // 折线宽 2（参考 lineWidth: 2）
    assert.ok(body.includes("lineWidth: 2,"), "折线宽 2，与参考一致");
}

// ── 执行 ───────────────────────────────────────────────────────
const tests: [string, () => void][] = [
    ["参数路由顺序(getWidgetView)", testParamOrderInGetWidgetView],
    ["参数路由顺序(main)", testParamOrderInMain],
    ["默认服务顺序", testPickDefaultOrder],
    ["渲染分支齐全", testRenderBranches],
    ["进度槽钳制", testProgressClamped],
    ["卡片动态标签", testWorkBuddyCardDynamicLabels],
    ["类型与选项注册", testTypesRegistered],
    ["AppIntent 覆盖", testAppIntentCoversDirect],
    ["配置入口接线", testConfigWiring],
    ["直连独立缓存键", testDirectUsesOwnCache],
    ["组件导入完整", testScriptingComponentsImported],
    ["中号版式对齐参考", testMediumMatchesReference],
];

let passed = 0;
try {
    for (const [name, fn] of tests) {
        fn();
        passed++;
        console.log(`  ok  ${name}`);
    }
    console.log(`PASS ${passed} render checks`);
} catch (error) {
    console.error(`FAIL after ${passed}/${tests.length} checks`);
    console.error((error as Error)?.stack || error);
    process.exitCode = 1;
}
