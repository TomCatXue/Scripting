// 源码断言：插件页关键契约
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../plugins_view.tsx", import.meta.url), "utf8");

function testUsesPluginLayer(): void {
    for (const fn of ["parsePlugins", "serializePlugins", "setPluginEnabled", "removePlugin"]) {
        assert.equal(src.includes(fn), true, `插件页应复用 plugins.ts 的 ${fn}`);
    }
}

function testReadsAndWritesDeviceText(): void {
    assert.equal(src.includes("fetchPluginsText"), true, "应读取设备插件文本");
    assert.equal(src.includes("savePluginsText"), true, "应保存插件文本");
}

function testDestructiveOpsConfirmed(): void {
    assert.equal(src.includes("confirmAction"), true, "删除/覆盖等操作需要二次确认");
    const deleteIdx = src.indexOf("handleDelete");
    assert.equal(deleteIdx >= 0, true, "应有删除处理函数");
}

function testHonestEmptyAndErrorStates(): void {
    assert.equal(src.includes("EmptyState"), true, "空状态组件");
    assert.equal(src.includes("ErrorState"), true, "错误态组件");
    assert.equal(src.includes("重试"), true, "错误态应可重试");
}

function testNoFabricatedPluginData(): void {
    assert.equal(/const\s+SAMPLE_PLUGINS/.test(src), false, "不得内置示例插件数据冒充真实插件");
    assert.equal(/mockPlugins/.test(src), false, "不得使用 mock 插件列表");
}

function testUsesToolbarProp(): void {
    assert.equal(/<Toolbar\b/.test(src), false, "不应把 Toolbar 作为子组件使用");
    assert.equal(/<ToolbarItem\b/.test(src), false, "不应使用 ToolbarItem");
    assert.equal(src.includes("toolbar={{"), true, "应使用 toolbar 属性");
}

function testUsesPullToRefresh(): void {
    assert.equal(src.includes("refreshable"), true, "插件列表应支持下拉刷新");
}

const tests: Array<[string, () => void]> = [
    ["uses plugin layer", testUsesPluginLayer],
    ["reads and writes device text", testReadsAndWritesDeviceText],
    ["destructive ops confirmed", testDestructiveOpsConfirmed],
    ["honest empty and error states", testHonestEmptyAndErrorStates],
    ["no fabricated plugin data", testNoFabricatedPluginData],
    ["uses toolbar prop", testUsesToolbarProp],
    ["uses pull to refresh", testUsesPullToRefresh],
];

let passed = 0;
try {
    for (const [name, fn] of tests) {
        fn();
        passed += 1;
    }
    console.log(`PASS ${passed} plugins-view checks`);
} catch (error) {
    console.error(`FAIL after ${passed}/${tests.length} checks`);
    console.error((error as Error)?.stack || error);
    process.exitCode = 1;
}
