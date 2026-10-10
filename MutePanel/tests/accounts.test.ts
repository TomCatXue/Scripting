// 账号注册表 / 凭据命名空间 / 遗留回落 的单元测试。
// 运行：node --import "./MutePanel/tests/register.mjs" "./MutePanel/tests/accounts.test.ts"
import assert from "node:assert/strict";
import { installGlobals, resetGlobals, keychainRaw, storageRaw } from "./globals.ts";

installGlobals();

const {
  LEGACY_ACCOUNT_ID,
  isValidAccountId,
  registryKey,
  listAccounts,
  getDefaultAccountId,
  addAccount,
  removeAccount,
  setAccountEnabled,
  setDefaultAccount,
  renameAccount,
  getAccountCredential,
  setAccountCredential,
  clearAccountCredentials,
  hasAnyConfiguredAccount,
} = await import("../accounts.ts");

// ── 1. id 合法性 ────────────────────────────────────────────────
function testAccountIdValidation(): void {
    assert.equal(isValidAccountId("abc12345"), true, "小写字母数字应合法");
    assert.equal(isValidAccountId(LEGACY_ACCOUNT_ID), true, "legacy 是合法 id");
    assert.equal(isValidAccountId("ABC12345"), false, "大写不合法（Keychain 键统一小写）");
    assert.equal(isValidAccountId("abc"), false, "短于 4 位不合法");
    assert.equal(isValidAccountId("a".repeat(17)), false, "长于 16 位不合法");
    assert.equal(isValidAccountId("abc-1234"), false, "连字符不合法");
    assert.equal(isValidAccountId("abc_1234"), false, "下划线不合法（会与键分隔符冲突）");
    assert.equal(isValidAccountId(""), false, "空串不合法");
}

// ── 2. 注册表 CRUD ─────────────────────────────────────────────
function testRegistryCrud(): void {
    resetGlobals();

    assert.deepEqual(listAccounts("codex"), [], "初始无账号");
    assert.equal(getDefaultAccountId("codex"), null, "初始无默认账号");

    const a = addAccount("codex", "账号A");
    const b = addAccount("codex", "账号B");
    assert.ok(isValidAccountId(a.id), "新账号 id 合法");
    assert.notEqual(a.id, b.id, "两次生成的 id 不同");
    assert.equal(a.on, true, "新账号默认启用");

    assert.equal(listAccounts("codex").length, 2, "两个账号");
    assert.equal(getDefaultAccountId("codex"), a.id, "首个账号成为默认");

    setAccountEnabled("codex", b.id, false);
    assert.equal(listAccounts("codex").find((x: any) => x.id === b.id)?.on, false, "停用生效");

    setDefaultAccount("codex", b.id);
    assert.equal(getDefaultAccountId("codex"), b.id, "改默认生效");

    renameAccount("codex", b.id, "账号B改名");
    assert.equal(listAccounts("codex").find((x: any) => x.id === b.id)?.label, "账号B改名", "重命名生效");

    removeAccount("codex", b.id);
    assert.equal(listAccounts("codex").length, 1, "删除后剩一个");
    assert.equal(getDefaultAccountId("codex"), a.id, "默认账号被删后回落到剩余账号");
}

// ── 3. 服务之间互不串扰 ─────────────────────────────────────────
function testServicesAreIsolated(): void {
    resetGlobals();
    addAccount("codex", "C");
    addAccount("deepseek", "D");
    assert.equal(listAccounts("codex").length, 1, "codex 一个");
    assert.equal(listAccounts("deepseek").length, 1, "deepseek 一个");
    assert.equal(listAccounts("antigravity").length, 0, "antigravity 未配置为空");
    assert.notEqual(registryKey("codex"), registryKey("deepseek"), "注册表键按服务区分");
}

// ── 4. 凭据命名空间 ────────────────────────────────────────────
function testCredentialNamespacing(): void {
    resetGlobals();
    const a = addAccount("codex", "A");
    const b = addAccount("codex", "B");

    setAccountCredential("codex", a.id, "token", "token-A");
    setAccountCredential("codex", b.id, "token", "token-B");

    assert.equal(getAccountCredential("codex", a.id, "token"), "token-A", "A 读到自己的");
    assert.equal(getAccountCredential("codex", b.id, "token"), "token-B", "B 读到自己的");
    assert.equal(getAccountCredential("codex", a.id, "refresh"), "", "未设置的字段返回空串");

    clearAccountCredentials("codex", a.id);
    assert.equal(getAccountCredential("codex", a.id, "token"), "", "清除后读不到");
    assert.equal(getAccountCredential("codex", b.id, "token"), "token-B", "清除 A 不影响 B");
}

// ── 5. 遗留键回落（老用户零迁移）──────────────────────────────
function testLegacyFallback(): void {
    resetGlobals();
    // 预置遗留单账号键，且不写注册表 —— 模拟升级前的老配置
    keychainRaw()["dashboard_kit_codex_token"] = "legacy-token";
    keychainRaw()["dashboard_kit_codex_refresh_token"] = "legacy-refresh";
    keychainRaw()["dashboard_kit_codex_account_id"] = "legacy-acct";

    const accounts = listAccounts("codex");
    assert.equal(accounts.length, 1, "自动播种一个账号");
    assert.equal(accounts[0].id, LEGACY_ACCOUNT_ID, "播种账号 id 为 legacy");
    assert.equal(accounts[0].on, true, "播种账号默认启用");
    assert.equal(getDefaultAccountId("codex"), LEGACY_ACCOUNT_ID, "播种账号成为默认");

    assert.equal(getAccountCredential("codex", LEGACY_ACCOUNT_ID, "token"), "legacy-token", "回落读遗留 token");
    assert.equal(getAccountCredential("codex", LEGACY_ACCOUNT_ID, "refresh"), "legacy-refresh", "回落读遗留 refresh");
    assert.equal(getAccountCredential("codex", LEGACY_ACCOUNT_ID, "accountId"), "legacy-acct", "回落读遗留 accountId");
}

// ── 6. Antigravity 遗留别名 ────────────────────────────────────
function testAntigravityLegacyAlias(): void {
    resetGlobals();
    // 历史别名：dashboard_kit_antigravity_refresh（无 _token 后缀）
    keychainRaw()["dashboard_kit_antigravity_refresh"] = "alias-refresh";

    assert.equal(
        getAccountCredential("antigravity", LEGACY_ACCOUNT_ID, "refresh"),
        "alias-refresh",
        "读到历史别名键"
    );

    // 新键优先于别名
    keychainRaw()["dashboard_kit_antigravity_refresh_token"] = "primary-refresh";
    assert.equal(
        getAccountCredential("antigravity", LEGACY_ACCOUNT_ID, "refresh"),
        "primary-refresh",
        "主键优先于别名"
    );
}

// ── 7. 播种不写遗留键（非破坏性）───────────────────────────────
function testSeedingIsNonDestructive(): void {
    resetGlobals();
    keychainRaw()["dashboard_kit_deepseek_token"] = "ds-legacy";
    const before = JSON.stringify(keychainRaw());

    listAccounts("deepseek"); // 触发播种
    getAccountCredential("deepseek", LEGACY_ACCOUNT_ID, "token");

    assert.equal(JSON.stringify(keychainRaw()), before, "播种与读取均不修改 Keychain");
}

// ── 8. 新账号不回落遗留键 ──────────────────────────────────────
function testNewAccountDoesNotReadLegacy(): void {
    resetGlobals();
    keychainRaw()["dashboard_kit_deepseek_token"] = "ds-legacy";
    const fresh = addAccount("deepseek", "新账号");

    assert.equal(
        getAccountCredential("deepseek", fresh.id, "token"),
        "",
        "新账号读不到遗留键（避免两个账号共用同一凭据）"
    );
    // 而 legacy 账号仍能读到
    assert.equal(getAccountCredential("deepseek", LEGACY_ACCOUNT_ID, "token"), "ds-legacy", "legacy 仍可读");
}

// ── 8b. legacy 账号写透到遗留键 ────────────────────────────────
function testLegacyWriteThrough(): void {
    resetGlobals();
    keychainRaw()["dashboard_kit_codex_token"] = "old-token";
    listAccounts("codex"); // 触发播种

    // 模拟 token 续期后写回
    setAccountCredential("codex", LEGACY_ACCOUNT_ID, "token", "new-token");
    assert.equal(
        keychainRaw()["dashboard_kit_codex_token"],
        "new-token",
        "legacy 账号写入会同步到遗留固定键，外部读取方仍能拿到新值"
    );
    assert.equal(getAccountCredential("codex", LEGACY_ACCOUNT_ID, "token"), "new-token", "本账号读到新值");

    // 新账号写入**不得**影响遗留键
    const fresh = addAccount("codex", "新账号");
    setAccountCredential("codex", fresh.id, "token", "fresh-token");
    assert.equal(keychainRaw()["dashboard_kit_codex_token"], "new-token", "新账号写入不污染遗留键");
}

// ── 9. 注册表损坏容错 ──────────────────────────────────────────
function testCorruptedRegistryRecovers(): void {
    resetGlobals();
    keychainRaw()["dashboard_kit_codex_token"] = "legacy-token";
    storageRaw()[registryKey("codex")] = "{ 这不是合法 JSON";

    const accounts = listAccounts("codex");
    assert.equal(accounts.length, 1, "损坏后回落到播种结果");
    assert.equal(accounts[0].id, LEGACY_ACCOUNT_ID, "回落账号为 legacy");
}

function testRegistryFiltersUnknownIds(): void {
    resetGlobals();
    storageRaw()[registryKey("codex")] = {
        version: 1,
        defaultId: "BADID",
        accounts: [
            { id: "good1234", label: "好", on: true, addedAt: "2026-01-01T00:00:00Z" },
            { id: "BADID", label: "坏", on: true, addedAt: "2026-01-01T00:00:00Z" },
            { id: "good1234", label: "重复", on: true, addedAt: "2026-01-01T00:00:00Z" },
        ],
    };

    const accounts = listAccounts("codex");
    assert.equal(accounts.length, 1, "过滤非法 id 与重复项");
    assert.equal(accounts[0].id, "good1234", "保留合法项");
    assert.equal(getDefaultAccountId("codex"), null, "非法默认 id 归零");
}

// ── 10. 保留 id 不可占用 ───────────────────────────────────────
function testLegacyIdIsReserved(): void {
    resetGlobals();
    assert.throws(() => addAccount("codex", "x", LEGACY_ACCOUNT_ID), /保留|reserved/i, "legacy 为保留 id");
}

// ── 11. 配置态判定 ─────────────────────────────────────────────
function testHasAnyConfiguredAccount(): void {
    resetGlobals();
    assert.equal(hasAnyConfiguredAccount("codex"), false, "空注册表为未配置");

    keychainRaw()["dashboard_kit_codex_token"] = "t";
    assert.equal(hasAnyConfiguredAccount("codex"), true, "有遗留键即为已配置");

    resetGlobals();
    const a = addAccount("codex", "A");
    assert.equal(hasAnyConfiguredAccount("codex"), true, "有账号即为已配置");
    setAccountEnabled("codex", a.id, false);
    assert.equal(hasAnyConfiguredAccount("codex"), true, "停用仍算已配置（账号还在）");
}

// ── 执行 ───────────────────────────────────────────────────────
const tests: [string, () => void][] = [
    ["id 合法性", testAccountIdValidation],
    ["注册表 CRUD", testRegistryCrud],
    ["服务隔离", testServicesAreIsolated],
    ["凭据命名空间", testCredentialNamespacing],
    ["遗留回落", testLegacyFallback],
    ["Antigravity 遗留别名", testAntigravityLegacyAlias],
    ["播种非破坏性", testSeedingIsNonDestructive],
    ["新账号不读遗留", testNewAccountDoesNotReadLegacy],
    ["legacy 写透遗留键", testLegacyWriteThrough],
    ["注册表损坏容错", testCorruptedRegistryRecovers],
    ["过滤非法 id", testRegistryFiltersUnknownIds],
    ["legacy 为保留 id", testLegacyIdIsReserved],
    ["配置态判定", testHasAnyConfiguredAccount],
];

let passed = 0;
try {
    for (const [name, fn] of tests) {
        fn();
        passed++;
        console.log(`  ok  ${name}`);
    }
    console.log(`PASS ${passed} account checks`);
} catch (error) {
    console.error(`FAIL after ${passed}/${tests.length} checks`);
    console.error((error as Error)?.stack || error);
    process.exitCode = 1;
}
