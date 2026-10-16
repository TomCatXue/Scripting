// 源码断言：状态页 / 短信页 / 设置页的关键契约
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const status = read("../status_view.tsx");
const sms = read("../sms_view.tsx");
const settings = read("../settings_view.tsx");

// ── 状态页 ──────────────────────────────────────────
function testStatusUsesSnapshotAndCache(): void {
    assert.equal(status.includes("fetchWidgetSnapshot"), true, "状态页应使用快照抓取");
    assert.equal(status.includes("readWidgetCache"), true, "状态页应支持离线缓存展示");
    assert.equal(status.includes("saveWidgetCache"), true, "刷新后应写入缓存供小组件复用");
}

function testStatusHasTrafficChart(): void {
    assert.equal(status.includes("Chart"), true, "实时流量需要曲线图");
    assert.equal(status.includes("dlHistory") || status.includes("dl_speed"), true, "曲线需要上下行数据");
}

function testStatusShowsSimAndWifi(): void {
    assert.equal(/ICCID|iccid/.test(status), true, "SIM 卡区块应包含 ICCID");
    assert.equal(/暂不支持/.test(status), true, "缺失字段应明确标注不支持");
}

function testStatusQuickActionsConfirmReboot(): void {
    assert.equal(status.includes("confirmAction"), true, "重启等操作需要二次确认");
    assert.equal(/reboot|重启/.test(status), true, "快捷操作应包含重启入口");
}

function testStatusRefreshable(): void {
    assert.equal(status.includes("refreshable"), true, "状态页应支持下拉刷新");
}

// 标签切走会卸载视图、state 归零。若已加载数据只存在 state 里，
// 再次进入时加载锁已置位 → 页面卡在「加载中」或谎称「暂无数据」。
function testViewsCacheLoadedDataAtModuleScope(): void {
    assert.equal(/_statusCache/.test(status), true, "状态页应将最近数据缓存到模块级");
    assert.equal(
        /if \(!_statusLoaded\)[\s\S]{0,400}?_statusCache/.test(status) || status.includes("_statusCache ?? readWidgetCache()"),
        true,
        "状态页重挂载时应先水合模块级缓存，避免卡在加载中",
    );
    assert.equal(/_smsCache/.test(sms), true, "短信页应将最近数据缓存到模块级");
    assert.equal(/_pluginsCache/.test(src_plugins()), true, "插件页应将最近数据缓存到模块级");
    assert.equal(
        /if \(!_pluginsLoaded\)[\s\S]{0,400}?_pluginsCache/.test(src_plugins()),
        true,
        "插件页重挂载时应先水合缓存，避免误报「设备上没有插件」",
    );
}

// toolbar 是「可见页面内容」上的属性（toolbar={{...}}），
// 不是塞进 List 的子组件。用错的写法在真机上工具栏按钮不会出现。
function testViewsUseToolbarPropNotChildren(): void {
    for (const [name, source] of [["status", status], ["sms", sms], ["settings", settings]] as const) {
        assert.equal(/<Toolbar\b/.test(source), false, `${name} 页不应把 Toolbar 作为子组件使用`);
        assert.equal(/<ToolbarItem\b/.test(source), false, `${name} 页不应使用 ToolbarItem`);
        assert.equal(source.includes("toolbar={{"), true, `${name} 页应使用 toolbar 属性`);
    }
}

function src_plugins(): string {
    return read("../plugins_view.tsx");
}

// ── 短信页 ──────────────────────────────────────────
function testSmsReusesApi(): void {
    for (const fn of ["fetchSMSMessages", "sendSMS", "extractVerifyCode"]) {
        assert.equal(sms.includes(fn), true, `短信页应复用 ${fn}`);
    }
}

function testSmsHasConversationAndDetail(): void {
    assert.equal(sms.includes("groupConversations"), true, "应有会话分组逻辑");
    assert.equal(sms.includes("selectedNumber"), true, "应支持进入会话详情");
}

function testSmsSendFailureIsSurfaced(): void {
    assert.equal(/发送失败|error/i.test(sms), true, "发送失败必须有明确提示");
}

// ── 设置页 ──────────────────────────────────────────
function testSettingsReusesConfigLayer(): void {
    assert.equal(settings.includes("readSetting"), true, "设置页应读取现有配置");
    assert.equal(settings.includes("saveSetting"), true, "设置页应写入现有配置");
}

function testSettingsHasAppearanceControls(): void {
    for (const fn of ["loadAccent", "saveAccent", "loadAppearance", "saveAppearance", "loadMotion", "saveMotion"]) {
        assert.equal(settings.includes(fn), true, `设置页应包含 ${fn}`);
    }
}

function testSettingsSeparatesPasswords(): void {
    assert.equal(/UFI/.test(settings) && /ZTE/.test(settings), true, "UFI-TOOLS 与 ZTE 密码必须分组区分");
    assert.equal(settings.includes("SecureField"), true, "密码默认隐藏");
}

function testSettingsHasVolteAndReset(): void {
    assert.equal(settings.includes("fetchVolteState") && settings.includes("setVolteState"), true, "应提供 VoLTE 开关");
    assert.equal(settings.includes("confirmAction"), true, "重置/清除操作需要确认");
}

const tests: Array<[string, () => void]> = [
    ["status snapshot + cache", testStatusUsesSnapshotAndCache],
    ["status traffic chart", testStatusHasTrafficChart],
    ["status sim and wifi", testStatusShowsSimAndWifi],
    ["status reboot confirm", testStatusQuickActionsConfirmReboot],
    ["status refreshable", testStatusRefreshable],
    ["views cache loaded data", testViewsCacheLoadedDataAtModuleScope],
    ["views use toolbar prop", testViewsUseToolbarPropNotChildren],
    ["sms reuses api", testSmsReusesApi],
    ["sms conversation and detail", testSmsHasConversationAndDetail],
    ["sms failure surfaced", testSmsSendFailureIsSurfaced],
    ["settings config layer", testSettingsReusesConfigLayer],
    ["settings appearance", testSettingsHasAppearanceControls],
    ["settings passwords separated", testSettingsSeparatesPasswords],
    ["settings volte and reset", testSettingsHasVolteAndReset],
];

let passed = 0;
try {
    for (const [name, fn] of tests) {
        fn();
        passed += 1;
    }
    console.log(`PASS ${passed} view checks`);
} catch (error) {
    console.error(`FAIL after ${passed}/${tests.length} checks`);
    console.error((error as Error)?.stack || error);
    process.exitCode = 1;
}
