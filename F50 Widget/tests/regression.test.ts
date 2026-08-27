import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setMockFetch } from "./scripting.mock.ts";
import { buildState, emptyState } from "../widget_data.ts";
import { fetchSMSMessages, setSessionSettings } from "../api.ts";

async function testRouterSMSComesFirstAndDecodes(): Promise<void> {
    const requests: Array<{ url: string; referer: string | null }> = [];
    setMockFetch((req) => {
        requests.push({
            url: req.url,
            referer: req.headers.get("Referer"),
        });
        if (req.url.startsWith("http://192.168.0.1/goform/")) {
            return {
                status: 200,
                text: async () => JSON.stringify({
                    messages: [{
                        id: "17",
                        number: "10086",
                        content: "6L+Z5piv5rex5bqm77yB",
                        date: "2026,08,13,14,25,09,+08",
                        tag: "1",
                    }],
                }),
            };
        }
        return {
            status: 502,
            text: async () => JSON.stringify({ error: "ufi unreachable" }),
        };
    });

    const messages = await fetchSMSMessages();

    assert.equal(requests[0]?.url.startsWith("http://192.168.0.1/goform/goform_get_cmd_process"), true);
    assert.equal(requests[0]?.referer, "http://192.168.0.1/index.html");
    assert.deepEqual(messages, [{
        id: "17",
        number: "10086",
        content: "这是深度！",
        dateText: "2026-08-13 14:25:09",
        isUnread: true,
        isOutgoing: false,
    }]);
}

async function testRouterSMSRetriesAfterLogin(): Promise<void> {
    setSessionSettings({ url: "http://192.168.0.1:2333", ztePassword: "smspwd" });
    const requests: Array<{ url: string; method: string; cookie: string | null; body: string | null }> = [];
    let smsAttempts = 0;
    setMockFetch(async (req) => {
        requests.push({
            url: req.url,
            method: req.method || "GET",
            cookie: req.headers.get("Cookie") ?? null,
            body: req.body ?? null,
        });
        if (String(req.url).includes("cmd=sms_data_total")) {
            smsAttempts += 1;
            if (smsAttempts === 1) {
                // 未登录时固件只返回不含 messages 的响应
                return { status: 200, text: async () => JSON.stringify({ result: "0" }) };
            }
            return {
                status: 200,
                text: async () => JSON.stringify({
                    messages: [{
                        id: "17",
                        number: "10086",
                        content: "6L+Z5piv5rex5bqm77yB",
                        date: "2026,08,13,14,25,09,+08",
                        tag: "1",
                    }],
                }),
            };
        }
        if ((req.method || "GET") === "GET" && String(req.url).includes("cmd=LD")) {
            return { status: 200, text: async () => JSON.stringify({ LD: "deadbeef01" }) };
        }
        if ((req.method || "GET") === "POST" && String(req.url).includes("goform_set_cmd_process")) {
            return {
                status: 200,
                text: async () => "",
                headers: { get: (name: string) => (name === "Set-Cookie" ? "JSESSIONID=smstest" : null) },
            };
        }
        return { status: 599, text: async () => "" };
    });

    try {
        const messages = await fetchSMSMessages();
        assert.equal(smsAttempts, 2);
        assert.equal(requests.length >= 4, true);
        assert.equal(requests[0]?.cookie ?? null, null);
        const login = requests.find((r) => (r.method === "POST") && r.url.includes("goform_set_cmd_process"));
        assert.ok(login, "匿名 80 端口失败后应先登录再重试");
        assert.equal(login.url.startsWith("http://192.168.0.1/goform/goform_set_cmd_process"), true);
        assert.equal((login.body || "").includes("goformId=LOGIN"), true);
        const retry = requests.filter((r) => r.url.includes("cmd=sms_data_total"))[1];
        assert.equal(retry?.cookie ?? null, "JSESSIONID=smstest");
        assert.deepEqual(messages, [{
            id: "17",
            number: "10086",
            content: "这是深度！",
            dateText: "2026-08-13 14:25:09",
            isUnread: true,
            isOutgoing: false,
        }]);
        const ufiCalled = requests.some((r) => r.url.startsWith("http://192.168.0.1:2333"));
        assert.equal(ufiCalled, false);
    } finally {
        setSessionSettings(null);
    }
}

function trafficState(size: any, unit?: string) {
    return buildState({}, {
        data_volume_limit_size: size,
        data_volume_limit_unit: unit,
        monthly_rx_bytes: 1099511627776,
    }, 0, { total: 0, available: 0 });
}

function testCompoundOneTBFormatsAsTB(): void {
    const state = trafficState("1024_1024");
    assert.equal(state.traffic_limit_value, "1.10");
    assert.equal(state.traffic_limit_unit, "TB");
    assert.equal(state.traffic_used_value, "1.10");
    assert.equal(state.traffic_used_unit, "TB");
}

function testCompoundValueDisplaysWithCarrierUnits(): void {
    const state = trafficState("1000_1024");
    assert.equal(state.traffic_limit_value, "1.07");
    assert.equal(state.traffic_limit_unit, "TB");
}

function testRawByteLimitDoesNotMultiplyAgain(): void {
    const state = trafficState(1099511627776);
    assert.equal(state.traffic_limit_value, "1.10");
    assert.equal(state.traffic_limit_unit, "TB");
}

function testTrafficUsesCarrierUnits(): void {
    const oneTerabyte = trafficState(1000000000000);
    assert.equal(oneTerabyte.traffic_limit_value, "1.00");
    assert.equal(oneTerabyte.traffic_limit_unit, "TB");

    const justBelowTerabyte = trafficState(999000000000);
    assert.equal(justBelowTerabyte.traffic_limit_value, "999");
    assert.equal(justBelowTerabyte.traffic_limit_unit, "GB");
}

function testEmptyAndLoadedWidgetsShareLayout(): void {
    const source = readFileSync(new URL("../widget.tsx", import.meta.url), "utf8");
    // 还原 9a5dc77（8 月 23 日）的旧版小组件样式
    assert.equal(/isEmpty\s*\?/.test(source), true);
    assert.equal(source.includes("SpeedDisplay"), false);
    assert.equal(source.includes("TrafficProgress"), false);
}

function testStatusSignalQualityUsesBarsIcon(): void {
    const source = readFileSync(new URL("../index.tsx", import.meta.url), "utf8");
    assert.equal(source.includes("checkmark.seal.fill"), false);
    const barsCount = (source.match(/systemName="cellularbars"/g) || []).length;
    assert.equal(barsCount >= 2, true);
    assert.equal(source.includes("signalBarColor(state.signalbar)"), true);
}

function signalState(g: any) {
    return buildState({}, g, 0, { total: 0, available: 0 });
}

function testSignalFieldsUseReferenceAliases(): void {
    const state = signalState({
        "5G_rsrp": "-82",
        "Z5g_rsrq": "-8",
        "Nr_snr": "24",
        rssi: "-82",
        SSID1: "F50",
    });
    assert.equal(state.signalbar, "4");
    assert.equal(state.rsrp_text, "-82dBm");
    assert.equal(state.rsrq_text, "-8");
    assert.equal(state.snr_text, "24");
    assert.equal(state.signal_quality, "极佳");
    assert.equal(state.signal_quality_color, "systemGreen");
}

function testSignalFieldsSkipZeroAndNull(): void {
    const state = signalState({
        nr_rsrp: null,
        Z5g_rsrp: "0",
        "5g_rsrp": "-95",
        nr_snr: "0",
        Nr_snr: "14",
        SSID1: "F50",
    });
    assert.equal(state.rsrp_text, "-95dBm");
    assert.equal(state.snr_text, "14");
    assert.equal(state.signal_quality, "良好");
    assert.equal(state.signal_quality_color, "systemBlue");
}

function testWifiBandTextFallsBackToDeviceInfo(): void {
    const state = buildState({ wifi_band: "5G" }, {}, 0, { total: 0, available: 0 });
    assert.equal(state.wifi_band_text, "5G");
    const freqState = buildState({ wifi_freq: 5180 }, {}, 0, { total: 0, available: 0 });
    assert.equal(freqState.wifi_band_text, "5G");
}

function testEmptyStateIsStable(): void {
    assert.equal(emptyState().traffic_limit_value, "--");
}

try {
    testEmptyStateIsStable();
    testRawByteLimitDoesNotMultiplyAgain();
    testCompoundOneTBFormatsAsTB();
    testCompoundValueDisplaysWithCarrierUnits();
    testTrafficUsesCarrierUnits();
    testEmptyAndLoadedWidgetsShareLayout();
    testStatusSignalQualityUsesBarsIcon();
    testSignalFieldsUseReferenceAliases();
    testSignalFieldsSkipZeroAndNull();
    testWifiBandTextFallsBackToDeviceInfo();
    await testRouterSMSComesFirstAndDecodes();
    await testRouterSMSRetriesAfterLogin();
    console.log("PASS 12 regression checks");
} catch (error) {
    console.error((error as Error)?.stack || error);
    process.exitCode = 1;
}
