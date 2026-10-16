// 源码断言：入口五标签结构（旧三标签必须被替换）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../index.tsx", import.meta.url), "utf8");

function testFiveTabs(): void {
    const titles = Array.from(src.matchAll(/<Tab\s+title="([^"]+)"/g)).map((m) => m[1]);
    assert.deepEqual(titles, ["状态", "短信", "电话", "插件", "设置"]);
}

function testTabValuesAreUnique(): void {
    const values = Array.from(src.matchAll(/value=\{(\d+)\}/g)).map((m) => Number(m[1]));
    assert.equal(values.length, 5);
    assert.equal(new Set(values).size, 5);
}

function testImportsAdaptedViews(): void {
    for (const name of ["StatusView", "SMSView", "PhoneView", "PluginsView", "SettingsView"]) {
        assert.equal(
            new RegExp(`import \\{ ${name} \\} from "./`).test(src),
            true,
            `入口应导入拆分的 ${name}`,
        );
    }
}

function testNoLegacyInlineViews(): void {
    assert.equal(/function\s+SMSView\s*\(/.test(src), false, "短信页应已拆分出 index.tsx");
    assert.equal(/function\s+SettingsView\s*\(/.test(src), false, "设置页应已拆分出 index.tsx");
    assert.equal(/function\s+StatusView\s*\(/.test(src), false, "状态页应已拆分出 index.tsx");
}

function testAppliesAppearancePreference(): void {
    assert.equal(src.includes("loadAppearance"), true, "入口应读取外观偏好");
    assert.equal(src.includes("preferredColorScheme"), true, "外观偏好应作用到 TabView");
}

const tests: Array<[string, () => void]> = [
    ["five tabs", testFiveTabs],
    ["unique tab values", testTabValuesAreUnique],
    ["imports adapted views", testImportsAdaptedViews],
    ["no legacy inline views", testNoLegacyInlineViews],
    ["applies appearance preference", testAppliesAppearancePreference],
];

let passed = 0;
try {
    for (const [name, fn] of tests) {
        fn();
        passed += 1;
    }
    console.log(`PASS ${passed} index checks`);
} catch (error) {
    console.error(`FAIL after ${passed}/${tests.length} checks`);
    console.error((error as Error)?.stack || error);
    process.exitCode = 1;
}
