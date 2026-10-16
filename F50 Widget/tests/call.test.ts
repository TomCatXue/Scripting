import assert from "node:assert/strict";
import {
    buildDialCommand,
    buildAnswerCommand,
    buildHangupCommand,
    buildStatusCommand,
    parseClcc,
    summarizeCall,
    parseAtsSuccess,
} from "../call.ts";

// ---- 号码清洗与命令构造 ----

function testDialCommandKeepsDialableCharacters(): void {
    assert.equal(buildDialCommand("138 0013 8000"), "ATD13800138000;");
    assert.equal(buildDialCommand("+86 138-0013-8000"), "ATD+8613800138000;");
    assert.equal(buildDialCommand("10086,,123#"), "ATD10086,,123#;");
}

function testDialCommandRejectsEmptyInput(): void {
    assert.equal(buildDialCommand(""), null);
    assert.equal(buildDialCommand("   "), null);
    assert.equal(buildDialCommand("中文"), null);
}

function testFixedCommands(): void {
    assert.equal(buildAnswerCommand(), "ATA");
    assert.equal(buildHangupCommand(), "ATH");
    assert.equal(buildStatusCommand(), "AT+CLCC");
}

// ---- AT+CLCC 解析 ----

function testParseClccEmptyMeansIdle(): void {
    assert.deepEqual(parseClcc("OK"), []);
    assert.deepEqual(parseClcc(""), []);
    assert.deepEqual(parseClcc("ERROR"), []);
}

function testParseClccSingleActiveCall(): void {
    const calls = parseClcc("+CLCC: 1,1,0,0,0,\"13800138000\",129\r\nOK\r\n");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].index, 1);
    assert.equal(calls[0].direction, "mt");
    assert.equal(calls[0].status, "active");
    assert.equal(calls[0].number, "13800138000");
}

function testParseClccOutgoingDialing(): void {
    const calls = parseClcc("+CLCC: 1,0,2,0,0,\"10086\",129\r\nOK\r\n");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].direction, "mo");
    assert.equal(calls[0].status, "dialing");
}

function testParseClccIncomingRinging(): void {
    const calls = parseClcc("+CLCC: 1,1,4,0,0,\"13800138000\",129\r\nOK\r\n");
    assert.equal(calls[0].status, "incoming");
}

function testParseClccMultipleCallsKeepsAll(): void {
    const raw = [
        "+CLCC: 1,0,0,0,0,\"10010\",129",
        "+CLCC: 2,1,5,0,0,\"13800138000\",129",
        "OK",
    ].join("\r\n");
    const calls = parseClcc(raw);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].status, "active");
    assert.equal(calls[1].status, "waiting");
}

function testParseClccToleratesMissingNumberAndJunk(): void {
    const calls = parseClcc("+CLCC: 1,0,3,0,0,\"\",129\r\nblah\r\nOK\r\n");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].status, "alerting");
    assert.equal(calls[0].number, "");
}

// ---- 状态汇总 ----

function testSummarizePrefersActive(): void {
    assert.equal(summarizeCall([]), "idle");
    assert.equal(summarizeCall(parseClcc("+CLCC: 1,1,4,0,0,\"x\",129\r\nOK")), "incoming");
    assert.equal(
        summarizeCall(parseClcc("+CLCC: 1,1,5,0,0,\"x\",129\r\n+CLCC: 2,0,0,0,0,\"y\",129\r\nOK")),
        "active",
    );
}

// ---- 指令结果判定 ----

function testAtsSuccessRules(): void {
    assert.equal(parseAtsSuccess("OK"), true);
    assert.equal(parseAtsSuccess("+CLCC: ...\r\nOK"), true);
    assert.equal(parseAtsSuccess("ERROR"), false);
    assert.equal(parseAtsSuccess("ERROR: NO CARRIER"), false);
    assert.equal(parseAtsSuccess(""), false);
}

function testAtsHangupTreatsNoCarrierAsSuccess(): void {
    assert.equal(parseAtsSuccess("NO CARRIER", true), true);
    assert.equal(parseAtsSuccess("OK", true), true);
    assert.equal(parseAtsSuccess("ERROR", true), false);
}

const tests: Array<[string, () => void]> = [
    ["dial command keeps dialable characters", testDialCommandKeepsDialableCharacters],
    ["dial command rejects empty input", testDialCommandRejectsEmptyInput],
    ["fixed commands", testFixedCommands],
    ["CLCC empty means idle", testParseClccEmptyMeansIdle],
    ["CLCC single active call", testParseClccSingleActiveCall],
    ["CLCC outgoing dialing", testParseClccOutgoingDialing],
    ["CLCC incoming ringing", testParseClccIncomingRinging],
    ["CLCC multiple calls", testParseClccMultipleCallsKeepsAll],
    ["CLCC tolerates missing number", testParseClccToleratesMissingNumberAndJunk],
    ["summarize prefers active", testSummarizePrefersActive],
    ["AT result success rules", testAtsSuccessRules],
    ["hangup treats NO CARRIER as success", testAtsHangupTreatsNoCarrierAsSuccess],
];

let passed = 0;
try {
    for (const [name, fn] of tests) {
        fn();
        passed += 1;
    }
    console.log(`PASS ${passed} call checks`);
} catch (error) {
    console.error(`FAIL after ${passed}/${tests.length} checks`);
    console.error((error as Error)?.stack || error);
    process.exitCode = 1;
}
