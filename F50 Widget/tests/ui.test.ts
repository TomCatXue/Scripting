// 源码断言：共享 UI 组件的契约（TSX 无法被 Node 直接导入，沿用 MutePanel 的 render.test.ts 模式）。
// 这些断言钉住「组件存在 + 关键无障碍/诚实性约束不被改掉」。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const uiSrc = readFileSync(new URL("../ui.tsx", import.meta.url), "utf8");

function testExportsSharedComponents(): void {
    for (const name of [
        "SectionCard",
        "DataRow",
        "MetricTile",
        "StatusPill",
        "EmptyState",
        "ErrorState",
        "LoadingState",
    ]) {
        assert.equal(
            new RegExp(`export function ${name}\\b`).test(uiSrc),
            true,
            `ui.tsx 应导出 ${name}`,
        );
    }
}

function testUsesSemanticColorsNotHardcodedGreys(): void {
    assert.equal(uiSrc.includes("secondaryLabel"), true, "次级信息应使用语义色");
    assert.equal(
        /#(?:[0-9a-fA-F]{3}){1,2}/.test(uiSrc),
        false,
        "ui.tsx 不应硬编码十六进制颜色（应走 theme token）",
    );
}

function testEveryStateHasExplicitText(): void {
    assert.equal(uiSrc.includes("暂不支持"), true, "不支持的能力必须有明确文案");
    assert.equal(uiSrc.includes("重试"), true, "错误态必须给出重试入口");
}

function testImportsAreLimitedToVerifiedPrimitives(): void {
    const start = uiSrc.indexOf("import {");
    const end = uiSrc.indexOf('} from "scripting"');
    assert.equal(start >= 0 && end > start, true, "ui.tsx 应有显式的 scripting 导入块");
    const importBlock = uiSrc.slice(start, end);
    const allowed = new Set([
        "HStack",
        "VStack",
        "ZStack",
        "Text",
        "Spacer",
        "Image",
        "Button",
        "Gauge",
        "ProgressView",
        "Rectangle",
        "RoundedRectangle",
        "Circle",
        "Divider",
        "Group",
        "modifiers",
        "useColorScheme",
    ]);
    const names = Array.from(importBlock.matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*)/gm)).map((m) => m[1]);
    for (const name of names) {
        if (name === "import" || name === "from") continue;
        assert.equal(allowed.has(name), true, `ui.tsx 使用了未验证的组件: ${name}`);
    }
    assert.equal(uiSrc.includes('from "scripting"'), true, "UI 组件必须从 scripting 导入");
}

function testConfirmDialogWrapperExists(): void {
    assert.equal(
        /export async function confirmAction\b/.test(uiSrc),
        true,
        "破坏性操作需要统一的二次确认封装",
    );
    assert.equal(uiSrc.includes("Dialog.confirm"), true, "确认应走系统 Dialog");
}

const tests: Array<[string, () => void]> = [
    ["exports shared components", testExportsSharedComponents],
    ["semantic colors only", testUsesSemanticColorsNotHardcodedGreys],
    ["explicit state text", testEveryStateHasExplicitText],
    ["imports limited to verified primitives", testImportsAreLimitedToVerifiedPrimitives],
    ["confirm dialog wrapper", testConfirmDialogWrapperExists],
];

let passed = 0;
try {
    for (const [name, fn] of tests) {
        fn();
        passed += 1;
    }
    console.log(`PASS ${passed} ui checks`);
} catch (error) {
    console.error(`FAIL after ${passed}/${tests.length} checks`);
    console.error((error as Error)?.stack || error);
    process.exitCode = 1;
}
