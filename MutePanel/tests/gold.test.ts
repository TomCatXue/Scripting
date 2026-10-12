// MutePanel gold quotes TDD tests
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installGlobals, resetGlobals } from "./globals.ts";
import { setMockFetch } from "./scripting.mock.ts";

installGlobals();

const data = await import("../data.ts");
const cardsSrc = readFileSync(new URL("../cards.tsx", import.meta.url), "utf8");

// 1. Test real-time gold quotes parsing
async function testRealtimeGoldQuotes() {
  resetGlobals();

  const mockAu9999 = {
    rc: 0,
    data: {
      f43: 90240, // 902.40 CNY/g
      f60: 90290, // 902.90 CNY/g
      f169: -50,  // -0.50 CNY/g
      f170: -6,   // -0.06%
      f58: "Au9999"
    }
  };
  const mockAutd = {
    rc: 0,
    data: {
      f43: 89850, // 898.50 CNY/g
      f60: 90249,
      f169: -399, // -3.99 CNY/g
      f170: -44,  // -0.44%
      f58: "Au(T+D)"
    }
  };
  const mockSge = {
    time: [
      ["2026-10-09", 892, 904.48, 888, 909],
      ["2026-10-12", 904.5, 902.9, 900, 911.9]
    ]
  };
  const mockCmb = {
    code: "SUC0000",
    data: {
      FQAMBPRCZ1: { zBuyPrc: "901.27", zPrcDif: "-0.45", zDvlCur: "-0.49" }
    }
  };
  const mockZs = {
    resultData: {
      datas: { price: "898.54", upAndDownAmt: "-0.59", upAndDownRate: "-0.07%" }
    }
  };

  setMockFetch((url) => {
    if (url.includes("118.AU9999")) {
      return { status: 200, ok: true, json: async () => mockAu9999 };
    }
    if (url.includes("118.AUTD")) {
      return { status: 200, ok: true, json: async () => mockAutd };
    }
    if (url.includes("Dailyhq")) {
      return { status: 200, ok: true, json: async () => mockSge };
    }
    if (url.includes("market-center")) {
      return { status: 200, ok: true, json: async () => mockCmb };
    }
    if (url.includes("stdLatestPrice")) {
      return { status: 200, ok: true, json: async () => mockZs };
    }
    return { status: 404, ok: false, text: async () => "not found" };
  });

  const res = await data.refreshGoldData();
  assert.ok(res, "should return gold data");

  assert.equal(res.prices.au9999, "902.40", "Au9999 must use real-time price");
  assert.equal(res.focusPrice, "902.40", "default focusPrice must be real-time");
  assert.equal(res.changeValue, "-0.50", "real-time changeValue");
  assert.equal(res.changeRate, "-0.06%", "real-time changeRate");
  assert.equal(res.isUp, false, "falling price isUp: false");

  assert.equal(res.prices.autd, "898.50", "AUTD must be real-time market price");
  assert.notEqual(res.prices.autd, (Number(res.prices.au9999) - 0.28).toFixed(2), "no hardcoded 0.28 fake diff");

  assert.equal(res.prices.cmbBuy, "901.27", "CMB buy price");
  assert.equal(res.prices.zsPrice, "898.54", "ZS price");
}

// 2. Test source switching and avoid cross-source calculation
async function testGoldSourceSwitching() {
  resetGlobals();
  Storage.set(data.GOLD_SOURCE_KEY, "cmb", { shared: true });

  const mockCmb = {
    code: "SUC0000",
    data: {
      FQAMBPRCZ1: { zBuyPrc: "901.27", zPrcDif: "-0.45", zDvlCur: "-0.49" }
    }
  };

  setMockFetch((url) => {
    if (url.includes("market-center")) {
      return { status: 200, ok: true, json: async () => mockCmb };
    }
    if (url.includes("Dailyhq")) {
      return {
        status: 200,
        ok: true,
        json: async () => ({
          time: [
            ["2026-10-09", 892, 904.48, 888, 909],
            ["2026-10-12", 904.5, 902.9, 900, 911.9]
          ]
        })
      };
    }
    return { status: 404, ok: false, text: async () => "not found" };
  });

  const res = await data.refreshGoldData();
  assert.ok(res);
  assert.equal(res.sourceId, "cmb");
  assert.equal(res.focusPrice, "901.27");
  assert.equal(res.changeValue, "-0.45", "CMB source must use CMB own delta");
  assert.equal(res.isUp, false, "falling isUp: false");

  // 3. Defense assertion: cards.tsx
  assert.ok(
    !cardsSrc.includes("dif = close - prev"),
    "GoldPriceSmallCard must not calculate cross-source delta"
  );
  assert.ok(
    !cardsSrc.includes("data.prices?.cmbBuy || data.prices?.zsPrice"),
    "Medium card must not short-circuit ZS gold price"
  );
}

async function run() {
  await testRealtimeGoldQuotes();
  console.log("  ok  real-time gold quotes parsing");
  await testGoldSourceSwitching();
  console.log("  ok  source switching isolation");
  console.log("PASS all gold tests");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
