// WorkBuddy 官方直连凭据：解析 / 规范化 / 到期判定。
// 运行：node --import "./MutePanel/tests/register.mjs" "./MutePanel/tests/wb_direct.test.ts"
import assert from "node:assert/strict";
import { installGlobals, resetGlobals } from "./globals.ts";

installGlobals();

const {
  listWbDirectCandidates,
  WB_ENDPOINT_CN,
  WB_ENDPOINT_INTL,
  parseWbDirectCredential,
  wbDirectEndpoint,
  wbDirectCreditsUrl,
  wbDirectRefreshUrl,
  isCredentialStale,
  mergeRefreshedCredential,
} = await import("../wb_direct.ts");

/** 一份典型的国内版凭据（字段形态取自 magpie plugin-auth.json） */
function cnCredential(over: Record<string, any> = {}): any {
    return {
        type: "oauth",
        access: "eyJhbGciOiJSUzI1NiJ9.access",
        refresh: "rt_9f3c1a2b3c4d5e6f",
        expires: 1793755535570,
        refreshExpiresAt: 1793928335570,
        accountId: "13800138000",
        uid: "3f2a1b4c-5d6e-7f80-9a1b-2c3d4e5f6a7b",
        domain: "copilot.tencent.com",
        tokenType: "Bearer",
        ...over,
    };
}

// ── 1. 正常解析 ────────────────────────────────────────────────
function testParseValid(): void {
    const c = parseWbDirectCredential(JSON.stringify(cnCredential()));
    assert.equal(c.type, "oauth", "type 保留");
    assert.equal(c.access, "eyJhbGciOiJSUzI1NiJ9.access", "access 解析");
    assert.equal(c.refresh, "rt_9f3c1a2b3c4d5e6f", "refresh 解析");
    assert.equal(c.expires, 1793755535570, "expires 保持数值");
    assert.equal(c.refreshExpiresAt, 1793928335570, "refreshExpiresAt 解析");
    assert.equal(c.accountId, "13800138000", "accountId 解析");
    assert.equal(c.uid, "3f2a1b4c-5d6e-7f80-9a1b-2c3d4e5f6a7b", "uid 解析");
    assert.equal(c.domain, "copilot.tencent.com", "domain 解析");
    assert.equal(c.tokenType, "Bearer", "tokenType 解析");
    assert.equal(c.build, "workbuddy", "国内域名推断为国内版");
}

// ── 2. 外层包裹（整段 plugin-auth.json 条目）────────────────────
function testParseWrapped(): void {
    const wrapped = JSON.stringify({ workbuddy: cnCredential() });
    const c = parseWbDirectCredential(wrapped);
    assert.equal(c.access, "eyJhbGciOiJSUzI1NiJ9.access", "能从外层包裹中取出内层凭据");

    const wrappedAi = JSON.stringify({
        "workbuddy-ai": cnCredential({ domain: "www.workbuddy.ai", accountId: "a@b.com" }),
    });
    const c2 = parseWbDirectCredential(wrappedAi);
    assert.equal(c2.build, "workbuddy-ai", "国际版包裹正确识别");
}

// ── 3. 两套 build 的推断与端点 ─────────────────────────────────
function testBuildInferenceAndEndpoints(): void {
    const cn = parseWbDirectCredential(JSON.stringify(cnCredential()));
    assert.equal(wbDirectEndpoint(cn), WB_ENDPOINT_CN, "国内版端点");
    assert.equal(wbDirectEndpoint(cn), "https://copilot.tencent.com", "国内版端点常量正确");

    const intl = parseWbDirectCredential(
        JSON.stringify(cnCredential({ domain: "www.workbuddy.ai", accountId: "u@example.com" }))
    );
    assert.equal(intl.build, "workbuddy-ai", "国际版 build");
    assert.equal(wbDirectEndpoint(intl), WB_ENDPOINT_INTL, "国际版端点");
    assert.equal(wbDirectEndpoint(intl), "https://www.workbuddy.ai", "国际版端点常量正确");
}

// ── 4. 路径前缀差异（易错点）──────────────────────────────────
function testUrlPaths(): void {
    const cn = parseWbDirectCredential(JSON.stringify(cnCredential()));
    // 取积分接口无 /v2 前缀
    assert.equal(
        wbDirectCreditsUrl(cn),
        "https://copilot.tencent.com/billing/meter/get-user-resource-summary",
        "取积分路径不带 /v2"
    );
    // 续期接口带 /v2 前缀
    assert.equal(
        wbDirectRefreshUrl(cn),
        "https://copilot.tencent.com/v2/plugin/auth/token/refresh",
        "续期路径带 /v2"
    );
}

// ── 5. domain 缺失时按 build 回落 ─────────────────────────────
function testDomainFallback(): void {
    const noDomain = cnCredential({ domain: "" });
    const c = parseWbDirectCredential(JSON.stringify(noDomain));
    assert.equal(c.domain, "copilot.tencent.com", "缺 domain 时回落国内版主机名");
    assert.equal(wbDirectEndpoint(c), WB_ENDPOINT_CN, "端点仍可用");

    const noDomainIntl = cnCredential({ domain: "", accountId: "u@example.com" });
    const c2 = parseWbDirectCredential(JSON.stringify(noDomainIntl), "workbuddy-ai");
    assert.equal(c2.domain, "www.workbuddy.ai", "显式指定 build 时回落对应主机名");
}

// ── 6. refreshExpiresAt 缺失 ──────────────────────────────────
function testMissingRefreshExpiry(): void {
    const c = parseWbDirectCredential(JSON.stringify(cnCredential({ refreshExpiresAt: undefined })));
    assert.equal(c.refreshExpiresAt, undefined, "缺失时不臆造到期时间");
    // 无到期时间即视为可续期
    assert.equal(isCredentialStale(c, c.expires - 60_000), true, "access 临期仍应刷新");
}

// ── 7. 必填字段缺失应报错 ─────────────────────────────────────
function testMissingRequiredFields(): void {
    assert.throws(
        () => parseWbDirectCredential(JSON.stringify(cnCredential({ access: "" }))),
        /access/i,
        "缺 access 报错"
    );
    assert.throws(
        () => parseWbDirectCredential(JSON.stringify(cnCredential({ refresh: "" }))),
        /refresh/i,
        "缺 refresh 报错"
    );
    assert.throws(
        () => parseWbDirectCredential(JSON.stringify(cnCredential({ uid: "" }))),
        /uid/i,
        "缺 uid 报错"
    );
    assert.throws(() => parseWbDirectCredential("不是 JSON"), /JSON|解析/i, "非法 JSON 报错");
    assert.throws(() => parseWbDirectCredential(""), /JSON|解析|空/i, "空串报错");
}

// ── 8. 到期判定（按 build 区分提前量）─────────────────────────
function testStaleness(): void {
    const now = 1_000_000_000_000;

    // 距离到期还有 1 小时 → 不该刷新
    const fresh = parseWbDirectCredential(JSON.stringify(cnCredential({ expires: now + 3600_000 })));
    assert.equal(isCredentialStale(fresh, now), false, "充裕时间不刷新");

    // 距离到期还有 4 分钟 → 应刷新（提前量 5 分钟）
    const soon = parseWbDirectCredential(JSON.stringify(cnCredential({ expires: now + 4 * 60_000 })));
    assert.equal(isCredentialStale(soon, now), true, "临期 4 分钟应刷新");

    // 已过期
    const past = parseWbDirectCredential(JSON.stringify(cnCredential({ expires: now - 1000 })));
    assert.equal(isCredentialStale(past, now), true, "已过期应刷新");
}

// ── 9. 续期结果合并 ───────────────────────────────────────────
function testMergeRefreshed(): void {
    const base = parseWbDirectCredential(JSON.stringify(cnCredential()));

    // 续期返回新 access（含 expiresIn 秒）
    const now = 1_700_000_000_000;
    const merged = mergeRefreshedCredential(base, {
        accessToken: "new-access",
        refreshToken: "new-refresh",
        expiresIn: 3600,
        domain: "copilot.tencent.com",
        tokenType: "Bearer",
    }, now);
    assert.equal(merged.access, "new-access", "access 被替换");
    assert.equal(merged.refresh, "new-refresh", "refresh 被替换");
    assert.equal(merged.expires, now + 3600_000, "expiresIn 秒换算为毫秒到期时间");

    // expiresAt 毫秒优先于 expiresIn
    const merged2 = mergeRefreshedCredential(base, {
        accessToken: "a2",
        expiresAt: 1_800_000_000_000,
        expiresIn: 3600,
    }, now);
    assert.equal(merged2.expires, 1_800_000_000_000, "expiresAt 优先");

    // 未返回 refreshToken 时保留原 refresh（不能清空，否则再也无法续期）
    const merged3 = mergeRefreshedCredential(base, { accessToken: "a3", expiresIn: 60 }, now);
    assert.equal(merged3.refresh, base.refresh, "续期未返回 refresh 时保留原值");
    assert.equal(merged3.uid, base.uid, "续期不影响 uid");
    assert.equal(merged3.accountId, base.accountId, "续期不影响 accountId");
}

// ── 10. 续期失败保留旧 access（不清账号）──────────────────────
function testRefreshFailureKeepsOld(): void {
    const base = parseWbDirectCredential(JSON.stringify(cnCredential()));
    // 模拟续期抛错时的降级：调用方拿到 null，应继续用旧 access
    const fallback = mergeRefreshedCredential(base, null as any, Date.now());
    assert.equal(fallback.access, base.access, "续期失败保留旧 access");
    assert.equal(fallback.refresh, base.refresh, "续期失败保留 refresh");
}

// ── 11. 额外未知字段被忽略 ────────────────────────────────────
function testUnknownFieldsIgnored(): void {
    const c = parseWbDirectCredential(
        JSON.stringify(cnCredential({ 未知字段: "x", extra: { nested: true } }))
    );
    assert.equal(c.access, "eyJhbGciOiJSUzI1NiJ9.access", "正常解析不受未知字段影响");
    assert.equal((c as any).未知字段, undefined, "未知字段不进入结果");
}

// ── 12. 已解析对象可直接传入（幂等）───────────────────────────
function testParseIdempotent(): void {
    const once = parseWbDirectCredential(JSON.stringify(cnCredential()));
    const twice = parseWbDirectCredential(JSON.stringify(once));
    assert.deepEqual(twice, once, "对已规范化对象再次解析结果一致");
}

// ── 13. 整份 plugin-auth.json（多条目字典）─────────────────────
function testParseWholeFile(): void {
    // 真实文件顶层是一个含 8 个条目的字典，不是单条凭据
    const file = {
        workbuddy: cnCredential(),
        "{{SECRET_aaa}}": cnCredential({ uid: "u2" }),
        "workbuddy-ai": cnCredential({ domain: "www.workbuddy.ai", accountId: "a@b.com" }),
        "workbuddy-ai#vnhzbk": cnCredential({ domain: "www.workbuddy.ai", accountId: "c@d.com" }),
        "opencode-zen-free": { type: "api", key: "public" },
    };
    const c = parseWbDirectCredential(JSON.stringify(file));
    assert.equal(c.accountId, "13800138000", "整份文件时取 workbuddy 条目");
    assert.equal(c.build, "workbuddy", "build 正确");
}

function testParseWholeFileNoWorkbuddyKey(): void {
    // 没有 workbuddy 键时，回落到第一条 oauth 凭据
    const file = {
        "{{SECRET_aaa}}": cnCredential({ uid: "u-first" }),
        "{{SECRET_bbb}}": cnCredential({ uid: "u-second" }),
        "opencode-zen-free": { type: "api", key: "public" },
    };
    const c = parseWbDirectCredential(JSON.stringify(file));
    assert.equal(c.uid, "u-first", "取第一条 oauth 凭据");
}

// ── 14. 带键名的片段（不是合法 JSON）──────────────────────────
function testParseKeyedFragment(): void {
    // 用户常见操作：只复制了 `"workbuddy": { ... }` 这一段
    const fragment = `"workbuddy": ${JSON.stringify(cnCredential())}`;
    const c = parseWbDirectCredential(fragment);
    assert.equal(c.access, "eyJhbGciOiJSUzI1NiJ9.access", "补花括号后可解析");
}

function testParseTrailingComma(): void {
    const withComma = JSON.stringify(cnCredential(), null, 2).replace(/\n\}$/, ",\n}");
    const c = parseWbDirectCredential(withComma);
    assert.equal(c.access, "eyJhbGciOiJSUzI1NiJ9.access", "容忍尾随逗号");
}

// ── 15. 候选列表（供选择要导入的账号）────────────────────────
function testListCandidates(): void {
    const file = {
        workbuddy: cnCredential(),
        "{{SECRET_aaa}}": cnCredential({ uid: "u2", accountId: "{{PHONE_second}}" }),
        "workbuddy-ai": cnCredential({ domain: "www.workbuddy.ai", accountId: "a@b.com" }),
        "opencode-zen-free": { type: "api", key: "public" },
    };
    const list = listWbDirectCandidates(JSON.stringify(file));

    assert.equal(list.length, 3, "列出 3 条 oauth 凭据（api 条目被排除）");
    assert.deepEqual(
        list.map((x) => x.key),
        ["workbuddy", "{{SECRET_aaa}}", "workbuddy-ai"],
        "保留原始条目名，便于用户辨认"
    );
    assert.equal(list[1].credential.uid, "u2", "第二条解析正确");

    // 单条凭据也能列出
    assert.equal(listWbDirectCandidates(JSON.stringify(cnCredential())).length, 1, "单条凭据返回 1 项");
    // 无法解析时返回空数组而非抛错
    assert.deepEqual(listWbDirectCandidates("不是 JSON"), [], "解析失败返回空数组");
}

// ── 16. 截断的 JSON 必须给出可操作提示 ────────────────────────
function testTruncatedGivesActionableError(): void {
    const full = JSON.stringify({ workbuddy: cnCredential() });
    try {
        parseWbDirectCredential(full.slice(0, Math.floor(full.length / 2)));
        assert.fail("截断的 JSON 应当抛错");
    } catch (e: any) {
        assert.ok(
            /截断|剪贴板|文件/.test(String(e?.message)),
            `错误信息应给出可操作建议，实际: ${e?.message}`
        );
    }
}

// ── 执行 ───────────────────────────────────────────────────────
const tests: [string, () => void][] = [
    ["解析合法凭据", testParseValid],
    ["解析外层包裹", testParseWrapped],
    ["build 推断与端点", testBuildInferenceAndEndpoints],
    ["接口路径前缀", testUrlPaths],
    ["domain 回落", testDomainFallback],
    ["缺 refreshExpiresAt", testMissingRefreshExpiry],
    ["必填字段缺失报错", testMissingRequiredFields],
    ["到期判定", testStaleness],
    ["续期结果合并", testMergeRefreshed],
    ["续期失败保留旧值", testRefreshFailureKeepsOld],
    ["忽略未知字段", testUnknownFieldsIgnored],
    ["重复解析幂等", testParseIdempotent],
    ["整份 plugin-auth.json", testParseWholeFile],
    ["无 workbuddy 键的整份文件", testParseWholeFileNoWorkbuddyKey],
    ["带键名的片段", testParseKeyedFragment],
    ["容忍尾随逗号", testParseTrailingComma],
    ["候选列表", testListCandidates],
    ["截断给出可操作提示", testTruncatedGivesActionableError],
];

let passed = 0;
try {
    for (const [name, fn] of tests) {
        fn();
        passed++;
        console.log(`  ok  ${name}`);
    }
    console.log(`PASS ${passed} wb-direct checks`);
} catch (error) {
    console.error(`FAIL after ${passed}/${tests.length} checks`);
    console.error((error as Error)?.stack || error);
    process.exitCode = 1;
}
