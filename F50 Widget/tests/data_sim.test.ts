import assert from "node:assert/strict";
import { buildState, maskPhone, maskMac } from "../widget_data.ts";

function state(g: any) {
    return buildState({}, g, 0, { total: 0, available: 0 });
}

function testSimFieldsAreMasked(): void {
    const s = state({
        iccid: "89860612345678901234",
        sim_msisdn: "13800138000",
        imsi: "460001234567890",
        imei: "860001234567890",
        sim_pin_status: "1",
    });
    assert.equal(s.iccid_text.startsWith("898606"), true);
    assert.equal(s.iccid_text.includes("****"), true);
    assert.equal(s.iccid_text.endsWith("1234"), true);
    // 手机号必须脱敏：不得回显完整号码
    assert.equal(s.msisdn_text, "138****8000");
    assert.equal(s.msisdn_text.includes("13800138000"), false);
    assert.equal(s.imsi_text.endsWith("7890"), true);
    assert.equal(s.imsi_text.startsWith("*"), true);
    assert.equal(s.imsi_text.includes("460001234567890"), false);
    assert.equal(s.imei_text.endsWith("7890"), true);
    assert.equal(s.sim_pin_text, "已启用");
}

function testMissingSimFieldsStayUnavailable(): void {
    const s = state({});
    assert.equal(s.iccid_text, "--");
    assert.equal(s.msisdn_text, "--");
    assert.equal(s.sim_pin_text, "--");
    assert.deepEqual(s.wifi_clients, []);
}

function testWifiClientsParseFromJsonString(): void {
    const s = state({
        station_list: JSON.stringify([
            { hostname: "iPhone", ip: "192.168.0.12", mac: "AA:BB:CC:11:22:33" },
            { name: "iPad", ip_addr: "192.168.0.13", mac_addr: "AA:BB:CC:44:55:66" },
        ]),
    });
    assert.equal(s.wifi_clients.length, 2);
    assert.equal(s.wifi_clients[0].name, "iPhone");
    assert.equal(s.wifi_clients[0].ip, "192.168.0.12");
    assert.equal(s.wifi_clients[0].mac, "AA:BB:CC:··:··:··");
    assert.equal(s.wifi_clients[1].name, "iPad");
    assert.equal(s.wifi_clients[1].ip, "192.168.0.13");
}

function testWifiClientsTolerateBrokenJson(): void {
    const s = state({ station_list: "{not json" });
    assert.deepEqual(s.wifi_clients, []);
}

function testSpeedBytesCaptured(): void {
    const s = state({ realtime_rx_thrpt: "2097152", realtime_tx_thrpt: "1048576" });
    assert.equal(s.dl_bps, 2097152);
    assert.equal(s.ul_bps, 1048576);
}

function testMaskHelpers(): void {
    assert.equal(maskPhone("13800138000"), "138****8000");
    assert.equal(maskPhone("10086"), "10086");
    assert.equal(maskPhone(""), "--");
    assert.equal(maskMac("AA:BB:CC:DD:EE:FF"), "AA:BB:CC:··:··:··");
    assert.equal(maskMac(""), "--");
}

const tests: Array<[string, () => void]> = [
    ["sim fields masked", testSimFieldsAreMasked],
    ["missing sim fields", testMissingSimFieldsStayUnavailable],
    ["wifi clients parsed", testWifiClientsParseFromJsonString],
    ["wifi clients broken json", testWifiClientsTolerateBrokenJson],
    ["speed bytes captured", testSpeedBytesCaptured],
    ["mask helpers", testMaskHelpers],
];

let passed = 0;
try {
    for (const [name, fn] of tests) {
        fn();
        passed += 1;
    }
    console.log(`PASS ${passed} sim/wifi checks`);
} catch (error) {
    console.error(`FAIL after ${passed}/${tests.length} checks`);
    console.error((error as Error)?.stack || error);
    process.exitCode = 1;
}
