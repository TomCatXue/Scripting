// GitHub 监控中号小组件数据逻辑与回归测试
// 运行：node --import "./MutePanel/tests/register.mjs" "./MutePanel/tests/github.test.ts"
import assert from "node:assert/strict";
import { installGlobals, resetGlobals } from "./globals.ts";
import { setMockFetch } from "./scripting.mock.ts";

installGlobals();

const data = await import("../data.ts");
const types = await import("../types.ts");

function jsonResponse(body: any, headersRecord: Record<string, string> = {}, status = 200): any {
    const headersMap = new Map<string, string>(Object.entries(headersRecord));
    return {
        status,
        ok: status >= 200 && status < 300,
        text: async () => JSON.stringify(body),
        json: async () => body,
        headers: {
            get: (k: string) => headersMap.get(k.toLowerCase()) || headersRecord[k] || null,
            ...headersRecord,
        },
    };
}

// ── 1. 配置项读写与探测 ─────────────────────────────────────────
function testConfigAccessors(): void {
    resetGlobals();
    assert.equal(data.loadGitHubUsername(), "TomCatXue", "默认用户名为 TomCatXue");
    data.saveGitHubUsername("custom-dev");
    assert.equal(data.loadGitHubUsername(), "custom-dev", "保存并读取自定义用户名");

    assert.equal(data.loadGitHubToken(), "", "默认 Token 为空");
    data.saveGitHubToken("ghp_secret_token_123");
    assert.equal(data.loadGitHubToken(), "ghp_secret_token_123", "保存并读取 Token");

    assert.equal(data.loadGitHubInterval(), 30, "默认刷新间隔 30 分钟");
    data.saveGitHubInterval(60);
    assert.equal(data.loadGitHubInterval(), 60, "保存并读取刷新间隔");

    assert.equal(data.hasGitHubConfigured(), true, "配置了用户名后已配置探测为 true");
}

// ── 2. REST API 请求、增量计算与 Top 7 排序 ─────────────────────
async function testFetchAndDeltas(): Promise<void> {
    resetGlobals();
    data.saveGitHubUsername("testuser");
    data.saveGitHubToken("");

    const mockUser = {
        login: "testuser",
        name: "Test Developer",
        bio: "Code · Learn · Build",
        avatar_url: "https://avatars.githubusercontent.com/u/123456",
        followers: 100,
    };

    const mockRepos = [
        { name: "repo-a", stargazers_count: 50, forks_count: 10 },
        { name: "repo-b", stargazers_count: 120, forks_count: 25 },
        { name: "repo-c", stargazers_count: 10, forks_count: 2 },
        { name: "repo-d", stargazers_count: 80, forks_count: 15 },
        { name: "repo-e", stargazers_count: 300, forks_count: 60 },
        { name: "repo-f", stargazers_count: 5, forks_count: 1 },
        { name: "repo-g", stargazers_count: 90, forks_count: 18 },
        { name: "repo-h", stargazers_count: 15, forks_count: 3 },
        { name: "repo-i", stargazers_count: 2, forks_count: 0 },
    ];

    let calls: { url: string; headers: any }[] = [];
    setMockFetch(async (url: string, init?: any) => {
        calls.push({ url: String(url), headers: init?.headers });
        if (url.includes("/users/testuser/repos")) {
            return jsonResponse(mockRepos);
        }
        if (url.includes("/users/testuser")) {
            return jsonResponse(mockUser);
        }
        return jsonResponse({}, 404);
    });

    // 首次运行：变化量应全为 0
    const firstRes = await data.fetchGitHubData("testuser", "", 30, true);
    assert.equal(firstRes.username, "testuser");
    assert.equal(firstRes.name, "Test Developer");
    assert.equal(firstRes.followers, 100);
    assert.equal(firstRes.followersDelta, 0, "首次运行 Followers 增量为 0");
    // 总 Stars: 50 + 120 + 10 + 80 + 300 + 5 + 90 + 15 + 2 = 672
    assert.equal(firstRes.stars, 672, "总 Stars 正确求和");
    assert.equal(firstRes.starsDelta, 0, "首次运行 Stars 增量为 0");
    // 总 Forks: 10 + 25 + 2 + 15 + 60 + 1 + 18 + 3 + 0 = 134
    assert.equal(firstRes.forks, 134, "总 Forks 正确求和");
    assert.equal(firstRes.forksDelta, 0, "首次运行 Forks 增量为 0");

    // Top 7 降序排序验证
    assert.equal(firstRes.topRepos.length, 7, "截取前 7 个仓库");
    assert.equal(firstRes.topRepos[0].name, "repo-e", "Stars 最高仓库排名第 1");
    assert.equal(firstRes.topRepos[0].stars, 300);
    assert.equal(firstRes.topRepos[1].name, "repo-b", "第 2 名 repo-b (120 stars)");
    assert.equal(firstRes.topRepos[2].name, "repo-g", "第 3 名 repo-g (90 stars)");
    assert.equal(firstRes.topRepos[3].name, "repo-d", "第 4 名 repo-d (80 stars)");
    assert.equal(firstRes.topRepos[4].name, "repo-a", "第 5 名 repo-a (50 stars)");

    // 二次运行：模拟数值变化
    const mockUserUpdated = { ...mockUser, followers: 108 };
    const mockReposUpdated = [
        ...mockRepos.map((r) => (r.name === "repo-e" ? { ...r, stargazers_count: 315, forks_count: 65 } : r)),
    ];

    setMockFetch(async (url: string) => {
        if (url.includes("/users/testuser/repos")) return jsonResponse(mockReposUpdated);
        if (url.includes("/users/testuser")) return jsonResponse(mockUserUpdated);
        return jsonResponse({}, 404);
    });

    const secondRes = await data.fetchGitHubData("testuser", "", 30, true);
    assert.equal(secondRes.followers, 108);
    assert.equal(secondRes.followersDelta, 8, "Followers 增量计算当前值 - 上次缓存值 = +8");
    assert.equal(secondRes.stars, 687);
    assert.equal(secondRes.starsDelta, 15, "Stars 增量当前值 - 上次缓存值 = +15");
    assert.equal(secondRes.forks, 139);
    assert.equal(secondRes.forksDelta, 5, "Forks 增量当前值 - 上次缓存值 = +5");
}

// ── 3. Token Header 验证 ──────────────────────────────────────
async function testTokenHeader(): Promise<void> {
    resetGlobals();
    let authHeader = "";
    let uaHeader = "";

    setMockFetch(async (_url: string, init?: any) => {
        authHeader = init?.headers?.Authorization || "";
        uaHeader = init?.headers?.["User-Agent"] || "";
        return jsonResponse({ login: "authed-user", followers: 10 });
    });

    await data.fetchGitHubData("authed-user", "ghp_mock_secret_key", 30, true);
    assert.equal(authHeader, "Bearer ghp_mock_secret_key", "携带 Bearer Token 请求头");
    assert.equal(uaHeader, "Scripting-App", "携带标准 User-Agent 请求头");
}

// ── 4. 异常降级兜底 ───────────────────────────────────────────
async function testFallbackOnError(): Promise<void> {
    resetGlobals();
    setMockFetch(async () => {
        throw new Error("Network unreachable");
    });

    const fallback = await data.fetchGitHubData("offline-user", "", 30, true);
    assert.ok(fallback, "网络失败时降级返回兜底数据");
    assert.equal(fallback.serviceId, "github");
    assert.ok(Array.isArray(fallback.topRepos), "兜底数据包含 topRepos 数组");
}

// ── 执行 ───────────────────────────────────────────────────────
const tests: [string, () => Promise<void> | void][] = [
    ["配置项读写与探测", testConfigAccessors],
    ["REST API 请求、增量计算与 Top 7 排序", testFetchAndDeltas],
    ["Token Header 验证", testTokenHeader],
    ["异常降级兜底", testFallbackOnError],
];

let passed = 0;
for (const [name, fn] of tests) {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
}
console.log(`PASS ${passed} github checks`);
