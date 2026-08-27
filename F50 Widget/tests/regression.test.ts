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
    assert.equal(/isEmpty\s*\?/.test(source), false);
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
    await testRouterSMSComesFirstAndDecodes();
    console.log("PASS 7 regression checks");
} catch (error) {
    console.error((error as Error)?.stack || error);
    process.exitCode = 1;
}
