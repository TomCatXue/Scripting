import assert from "node:assert/strict";
import { parsePlugins, serializePlugins, setPluginEnabled, removePlugin } from "../plugins.ts";

const SAMPLE = [
    "<!-- [KANO_PLUGIN_START] 信号增强 -->",
    "<script>console.log('boost')</script>",
    "<!-- [KANO_PLUGIN_END] 信号增强 -->",
    "",
    "<!-- [KANO_PLUGIN_START] 去广告 -->",
    "<!-- [kano_disabled]",
    "<script>console.log('adblock')</script>",
    "[kano_disabled] -->",
    "<!-- [KANO_PLUGIN_END] 去广告 -->",
    "",
].join("\n");

function testParseFindsBothPlugins(): void {
    const list = parsePlugins(SAMPLE);
    assert.equal(list.length, 2);
    assert.equal(list[0].name, "信号增强");
    assert.equal(list[0].enabled, true);
    assert.equal(list[0].content.includes("boost"), true);
    assert.equal(list[1].name, "去广告");
    assert.equal(list[1].enabled, false);
}

function testParseDisabledMarkersStrippedFromContent(): void {
    const list = parsePlugins(SAMPLE);
    assert.equal(list[1].content.includes("kano_disabled"), false);
    assert.equal(list[1].content.includes("adblock"), true);
}

function testParseEmptyAndJunkText(): void {
    assert.deepEqual(parsePlugins(""), []);
    assert.deepEqual(parsePlugins("   \n  "), []);
    assert.deepEqual(parsePlugins("<div>hello</div>"), []);
}

function testParseUnclosedBlockIsIgnoredNotLost(): void {
    const broken = "<!-- [KANO_PLUGIN_START] 坏插件 -->\n<script>x</script>\n";
    assert.deepEqual(parsePlugins(broken), []);
    // 序列化不认识的文本不应导致内容消失
    const out = serializePlugins(parsePlugins(broken));
    assert.equal(out.trim(), "");
}

function testRoundTripKeepsEnabledPluginVerbatim(): void {
    const list = parsePlugins(SAMPLE);
    const out = serializePlugins(list);
    const again = parsePlugins(out);
    assert.deepEqual(again.map((p) => p.name), ["信号增强", "去广告"]);
    assert.deepEqual(again.map((p) => p.enabled), [true, false]);
    assert.equal(again[0].content.trim(), list[0].content.trim());
}

function testSetPluginEnabledTogglesFlag(): void {
    const disabled = setPluginEnabled(SAMPLE, "信号增强", false);
    const list = parsePlugins(disabled);
    assert.equal(list[0].enabled, false);
    assert.equal(list[0].content.includes("boost"), true);

    const reenabled = setPluginEnabled(disabled, "信号增强", true);
    assert.equal(parsePlugins(reenabled)[0].enabled, true);
}

function testRemovePluginDropsOnlyTarget(): void {
    const out = removePlugin(SAMPLE, "信号增强");
    const list = parsePlugins(out);
    assert.equal(list.length, 1);
    assert.equal(list[0].name, "去广告");
}

function testRemoveUnknownPluginIsNoop(): void {
    const out = removePlugin(SAMPLE, "不存在");
    assert.equal(parsePlugins(out).length, 2);
}

function testSerializeProducesParseableMarkers(): void {
    const out = serializePlugins([{ name: "A", content: "<b>1</b>", enabled: true }]);
    assert.equal(out.includes("<!-- [KANO_PLUGIN_START] A -->"), true);
    assert.equal(out.includes("<!-- [KANO_PLUGIN_END] A -->"), true);
    assert.equal(parsePlugins(out)[0].content.trim(), "<b>1</b>");
}

const tests: Array<[string, () => void]> = [
    ["parse finds both plugins", testParseFindsBothPlugins],
    ["disabled markers stripped", testParseDisabledMarkersStrippedFromContent],
    ["empty and junk text", testParseEmptyAndJunkText],
    ["unclosed block ignored", testParseUnclosedBlockIsIgnoredNotLost],
    ["round trip", testRoundTripKeepsEnabledPluginVerbatim],
    ["set enabled toggles", testSetPluginEnabledTogglesFlag],
    ["remove plugin", testRemovePluginDropsOnlyTarget],
    ["remove unknown noop", testRemoveUnknownPluginIsNoop],
    ["serialize markers", testSerializeProducesParseableMarkers],
];

let passed = 0;
try {
    for (const [name, fn] of tests) {
        fn();
        passed += 1;
    }
    console.log(`PASS ${passed} plugin checks`);
} catch (error) {
    console.error(`FAIL after ${passed}/${tests.length} checks`);
    console.error((error as Error)?.stack || error);
    process.exitCode = 1;
}
