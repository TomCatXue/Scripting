// 源码断言：电话页的关键契约（TSX 无法被 Node 直接导入）。
// 目标：能力探测、破坏性操作二次确认、AT 指令复用纯函数、不做假通话。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../phone_view.tsx", import.meta.url), "utf8");

function testProbesCapabilityBeforeUse(): void {
    assert.equal(src.includes("fetchVolteState"), true, "进入电话页应先探测 VoLTE 能力");
    assert.equal(src.includes("capability"), true, "需要显式的能力状态字段");
}

function testUsesPureCommandBuilders(): void {
    for (const fn of ["buildDialCommand", "buildAnswerCommand", "buildHangupCommand", "buildStatusCommand"]) {
        assert.equal(src.includes(fn), true, `应复用 call.ts 的 ${fn}`);
    }
}

function testDialRequiresConfirmation(): void {
    assert.equal(src.includes("confirmAction"), true, "拨号必须二次确认");
    const dialIdx = src.indexOf("handleDial");
    assert.equal(dialIdx >= 0, true, "应有 handleDial");
}

function testUnavailableStateIsHonest(): void {
    assert.equal(src.includes("未提供通话接口") || src.includes("暂不支持"), true, "缺少能力时必须如实提示");
    // 不允许存在「本地伪造通话状态」的函数：状态只能来自 AT 透传结果
    assert.equal(
        /(simulateCall|fakeCall|mockCall|mockDial)\s*\(/.test(src),
        false,
        "不应存在模拟通话函数",
    );
}

function testPollsOnlyWhileInCall(): void {
    assert.equal(src.includes("setInterval"), true, "通话中需要轮询状态");
    assert.equal(src.includes("clearInterval"), true, "离开通话必须停止轮询（避免耗尽设备）");
}

function testTimerUsesModuleScopeNotStaleClosure(): void {
    // 定时器回调里读 state 会拿到创建时的旧值（null），计时会永远停在 0。
    // 因此开始时间必须存在模块级变量里。
    assert.equal(/_callStartedAt\s*=/.test(src), true, "通话开始时间必须存模块级变量");
    assert.equal(
        /if\s*\(\s*inCallAt\s*!==\s*null\s*\)\s*setElapsed/.test(src),
        false,
        "不得在定时器回调里读 inCallAt（闭包会拿到旧值）",
    );
}

function testProbeResultSurvivesTabSwitch(): void {
    // 标签切走再切回会重新挂载组件、state 归零；若结果只存在 state 里，
    // 探测锁已置位 → 页面会永远停在「正在检测」，再也探测不了。
    assert.equal(/_probeResult\s*[:=]/.test(src), true, "探测结果必须缓存到模块级");
    assert.equal(
        /useState<boolean \| null>\(_probeResult\)/.test(src),
        true,
        "capability 初值应取模块级缓存结果",
    );
}

function testNoHardcodedPhoneNumbersOrSecrets(): void {
    assert.equal(/1[3-9]\d{9}/.test(src), false, "不得硬编码真实手机号");
    assert.equal(/password\s*[:=]\s*["'][^"']+["']/.test(src), false, "不得硬编码密码");
}

function testUsesToolbarProp(): void {
    assert.equal(/<Toolbar\b/.test(src), false, "不应把 Toolbar 作为子组件使用");
    assert.equal(/<ToolbarItem\b/.test(src), false, "不应使用 ToolbarItem");
    assert.equal(src.includes("toolbar={{"), true, "应使用 toolbar 属性");
}

const tests: Array<[string, () => void]> = [
    ["probes capability", testProbesCapabilityBeforeUse],
    ["reuses pure builders", testUsesPureCommandBuilders],
    ["dial requires confirmation", testDialRequiresConfirmation],
    ["unavailable state honest", testUnavailableStateIsHonest],
    ["polls only while in call", testPollsOnlyWhileInCall],
    ["timer avoids stale closure", testTimerUsesModuleScopeNotStaleClosure],
    ["probe result survives tab switch", testProbeResultSurvivesTabSwitch],
    ["no hardcoded secrets", testNoHardcodedPhoneNumbersOrSecrets],
    ["uses toolbar prop", testUsesToolbarProp],
];

let passed = 0;
try {
    for (const [name, fn] of tests) {
        fn();
        passed += 1;
    }
    console.log(`PASS ${passed} phone-view checks`);
} catch (error) {
    console.error(`FAIL after ${passed}/${tests.length} checks`);
    console.error((error as Error)?.stack || error);
    process.exitCode = 1;
}
