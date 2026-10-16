import assert from "node:assert/strict";
import { setMockFetch } from "./scripting.mock.ts";
import {
    fetchAT,
    fetchVolteState,
    setVolteState,
    fetchPluginsText,
    savePluginsText,
    setSessionSettings,
} from "../api.ts";

function setAuth(): void {
    setSessionSettings({ url: "http://192.168.0.1:2333", password: "testpwd" });
}

function jsonOk(body: any) {
    return { status: 200, text: async () => JSON.stringify(body) };
}

async function testFetchAtEncodesCommand(): Promise<void> {
    setAuth();
    const seen: string[] = [];
    setMockFetch(async (req) => {
        seen.push(req.url);
        return jsonOk({ result: "OK" });
    });
    try {
        const result = await fetchAT("ATD10086;", 0);
        assert.equal(result, "OK");
        assert.equal(seen.length, 1);
        assert.equal(seen[0].includes("/api/AT?"), true);
        assert.equal(seen[0].includes("command=ATD10086%3B"), true);
        assert.equal(seen[0].includes("slot=0"), true);
    } finally {
        setSessionSettings(null);
    }
}

async function testFetchAtSurfacesErrorPayload(): Promise<void> {
    setAuth();
    setMockFetch(async () => jsonOk({ error: "AT指令执行错误：..." }));
    try {
        let message = "";
        try {
            await fetchAT("AT+CLCC");
        } catch (e) {
            message = String((e as Error)?.message || e);
        }
        assert.equal(message.includes("AT指令执行错误"), true);
    } finally {
        setSessionSettings(null);
    }
}

async function testFetchVolteStateParsesBoolean(): Promise<void> {
    setAuth();
    setMockFetch(async () => jsonOk({ enabled: true }));
    try {
        assert.equal(await fetchVolteState(0), true);
    } finally {
        setSessionSettings(null);
    }
}

async function testFetchVolteStateReturnsNullWhenUnavailable(): Promise<void> {
    setAuth();
    setMockFetch(async () => ({ status: 404, text: async () => "not found" }));
    try {
        assert.equal(await fetchVolteState(0), null);
    } finally {
        setSessionSettings(null);
    }
}

async function testFetchVolteStateReturnsNullOnAuthFailure(): Promise<void> {
    setAuth();
    setMockFetch(async () => ({ status: 401, text: async () => "{}" }));
    try {
        assert.equal(await fetchVolteState(0), null);
    } finally {
        setSessionSettings(null);
    }
}

async function testSetVolteStatePostsEnabledFlag(): Promise<void> {
    setAuth();
    const bodies: string[] = [];
    setMockFetch(async (req) => {
        bodies.push(String(req.body || ""));
        return jsonOk({ result: "success" });
    });
    try {
        assert.equal(await setVolteState(true, 0), true);
        assert.equal(bodies[0].includes("\"enabled\":\"1\""), true);
    } finally {
        setSessionSettings(null);
    }
}

async function testFetchPluginsTextReturnsRawText(): Promise<void> {
    setAuth();
    setMockFetch(async () => jsonOk({ text: "<!-- [KANO_PLUGIN_START] A -->\n<b>1</b>\n<!-- [KANO_PLUGIN_END] A -->" }));
    try {
        const text = await fetchPluginsText();
        assert.equal(text.includes("KANO_PLUGIN_START"), true);
    } finally {
        setSessionSettings(null);
    }
}

async function testSavePluginsTextPostsText(): Promise<void> {
    setAuth();
    const bodies: string[] = [];
    setMockFetch(async (req) => {
        bodies.push(String(req.body || ""));
        return jsonOk({ result: "success" });
    });
    try {
        assert.equal(await savePluginsText("<b>x</b>"), true);
        assert.equal(bodies[0].includes("<b>x</b>"), true);
    } finally {
        setSessionSettings(null);
    }
}

async function testSavePluginsTextReportsFailure(): Promise<void> {
    setAuth();
    setMockFetch(async () => ({ status: 500, text: async () => JSON.stringify({ error: "插件总容量超出限制" }) }));
    try {
        assert.equal(await savePluginsText("x"), false);
    } finally {
        setSessionSettings(null);
    }
}

const tests: Array<[string, () => Promise<void>]> = [
    ["fetchAT encodes command", testFetchAtEncodesCommand],
    ["fetchAT surfaces error payload", testFetchAtSurfacesErrorPayload],
    ["fetchVolteState parses boolean", testFetchVolteStateParsesBoolean],
    ["fetchVolteState null on 404", testFetchVolteStateReturnsNullWhenUnavailable],
    ["fetchVolteState null on 401", testFetchVolteStateReturnsNullOnAuthFailure],
    ["setVolteState posts enabled", testSetVolteStatePostsEnabledFlag],
    ["fetchPluginsText raw text", testFetchPluginsTextReturnsRawText],
    ["savePluginsText posts body", testSavePluginsTextPostsText],
    ["savePluginsText reports failure", testSavePluginsTextReportsFailure],
];

let passed = 0;
try {
    for (const [name, fn] of tests) {
        await fn();
        passed += 1;
    }
    console.log(`PASS ${passed} api-call checks`);
} catch (error) {
    console.error(`FAIL after ${passed}/${tests.length} checks`);
    console.error((error as Error)?.stack || error);
    process.exitCode = 1;
}
