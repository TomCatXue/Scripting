// 入口与导入解析冒烟测试。
//
// Node 的 type-stripping 不支持 JSX，因此 .tsx 无法直接 import。
// 这里改为两层验证：
//   A. 真正 import 全部 .ts 模块（data / accounts / aggregate / wb_direct / oauth / theme），
//      确认模块图与运行时依赖可解析。
//   B. 静态校验 .ts/.tsx 里每一条具名 import 都能在目标文件中找到对应导出，
//      专门抓「导入了不存在的导出」——这类错误语法检查发现不了。
//
// 运行：node --import "./MutePanel/tests/register.mjs" "./MutePanel/tests/entry.test.ts"
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installGlobals } from "./globals.ts";

installGlobals();

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

// ── A. .ts 模块可加载 ─────────────────────────────────────────
async function testTsModulesLoad(): Promise<void> {
    const data = await import("../data.ts");
    const accounts = await import("../accounts.ts");
    const aggregate = await import("../aggregate.ts");
    const wbDirect = await import("../wb_direct.ts");
    const oauth = await import("../oauth.ts");

    // data.ts 新增的直连 API
    for (const fn of [
        "hasWbDirectConfigured",
        "getWbDirectData",
        "refreshWbDirectData",
        "setWbDirectCredential",
    ]) {
        assert.equal(typeof (data as any)[fn], "function", `data.ts 导出 ${fn}`);
    }
    // data.ts 原有 API 保持存在（向后兼容）
    for (const fn of [
        "hasDeepSeekConfigured", "getDeepSeekData", "refreshDeepSeekData",
        "hasCodexConfigured", "getCodexData", "refreshCodexData",
        "hasAntigravityConfigured", "getAntigravityData", "refreshAntigravityData",
    ]) {
        assert.equal(typeof (data as any)[fn], "function", `data.ts 保留 ${fn}`);
    }
    // WorkBuddy 已合并为单一「官方直连」：面板版实现应被彻底移除
    for (const fn of ["hasWbConfigured", "getWorkBuddyData", "refreshWorkBuddyData"]) {
        assert.equal((data as any)[fn], undefined, `data.ts 不应再导出面板版 ${fn}`);
    }

    assert.equal(typeof accounts.listAccounts, "function", "accounts 导出 listAccounts");
    assert.equal(typeof accounts.setAccountCredential, "function", "accounts 导出 setAccountCredential");
    assert.equal(typeof aggregate.aggregateQuota, "function", "aggregate 导出 aggregateQuota");
    assert.equal(typeof wbDirect.parseWbDirectCredential, "function", "wb_direct 导出解析函数");

    // oauth 的签名保持向后兼容（新增参数可选）
    assert.ok(oauth.completeCodexOAuth.length <= 2, "completeCodexOAuth 第二参数可选");
    assert.ok(oauth.completeAntigravityOAuth.length <= 2, "completeAntigravityOAuth 第二参数可选");
}

// ── B. 具名导入解析校验 ───────────────────────────────────────
/** 收集某文件里的全部具名导入：{ from, names[] } */
function collectImports(text: string): { from: string; names: string[] }[] {
    const out: { from: string; names: string[] }[] = [];
    const re = /import\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const names = m[1]
            .split(",")
            .map((s) => s.replace(/\/\*[\s\S]*?\*\//g, "").trim())
            .filter(Boolean)
            // 去掉 `type X` / `X as Y` 形式
            .map((s) => s.replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim())
            .filter(Boolean);
        out.push({ from: m[2], names });
    }
    return out;
}

/** 收集某文件导出的具名符号 */
function collectExports(text: string): Set<string> {
    const names = new Set<string>();
    // export const/let/function/class/interface/type/enum
    const decl =
        /export\s+(?:declare\s+)?(?:const|let|var|function|async function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
    let m: RegExpExecArray | null;
    while ((m = decl.exec(text)) !== null) names.add(m[1]);

    // export { A, B as C }
    const list = /export\s*\{([^}]*)\}/g;
    while ((m = list.exec(text)) !== null) {
        for (const part of m[1].split(",")) {
            const raw = part.trim().replace(/^type\s+/, "");
            if (!raw) continue;
            const alias = raw.split(/\s+as\s+/);
            names.add((alias[1] || alias[0]).trim());
        }
    }

    // export default
    if (/export\s+default/.test(text)) names.add("default");
    // export * from "..." —— 保守起见，标记为通配
    if (/export\s+\*\s+from/.test(text)) names.add("*");
    return names;
}

const MODULES: Record<string, string> = {
    "./data": "../data.ts",
    "./accounts": "../accounts.ts",
    "./aggregate": "../aggregate.ts",
    "./wb_direct": "../wb_direct.ts",
    "./oauth": "../oauth.ts",
    "./types": "../types.ts",
    "./theme": "../theme.ts",
    "./cards": "../cards.tsx",
    "./templates": "../templates.tsx",
    "./icons": "../icons.ts",
    "./widget": "../widget.tsx",
    "./bento_config": "../bento_config.ts",
    "./app_intents": "../app_intents.tsx",
};

const CONSUMERS = [
    "../data.ts", "../accounts.ts", "../aggregate.ts", "../wb_direct.ts", "../oauth.ts",
    "../widget.tsx", "../index.tsx", "../cards.tsx", "../templates.tsx", "../app_intents.tsx",
];

/**
 * 入口文件不得被其它模块导入。
 *
 * widget.tsx / index.tsx 这类「宿主入口」在文件底部会直接执行宿主逻辑。一旦被
 * import（哪怕只想复用里面的常量），它们就会在**当前宿主**里跑起来：
 * 设置页导入 "./widget" 时，Widget.present 在 App 进程里并不存在，
 * 抛 "not implemented method" 后 catch 里的 Script.exit() 会把设置页一起关掉。
 * 共享状态必须放在 bento_config.ts 这种普通模块里。
 *
 * 注意 app_intents.tsx 不在禁止之列：它只做 Intent 注册，按官方约定就是被
 * widget / cards 导入使用的共享模块。
 */
function testEntryFilesAreNotImported(): void {
    const ENTRY_FILES = ["../widget.tsx", "../index.tsx"];
    const problems: string[] = [];

    for (const rel of CONSUMERS) {
        if (ENTRY_FILES.includes(rel)) continue; // 入口之间互不导入即可
        const text = src(rel);
        for (const { from } of collectImports(text)) {
            const target = MODULES[from];
            if (target && ENTRY_FILES.includes(target)) {
                problems.push(`${rel} 导入了入口文件 ${target}（会连带执行其宿主逻辑）`);
            }
        }
    }

    assert.deepEqual(problems, [], `存在对入口文件的导入:\n  ${problems.join("\n  ")}`);
}

function testNamedImportsResolve(): void {
    // 预读各模块导出集合
    const exportsOf = new Map<string, Set<string>>();
    for (const [spec, rel] of Object.entries(MODULES)) {
        exportsOf.set(spec, collectExports(src(rel)));
    }

    const problems: string[] = [];
    for (const rel of CONSUMERS) {
        const text = src(rel);
        for (const { from, names } of collectImports(text)) {
            const exp = exportsOf.get(from);
            if (!exp) continue; // 非本地模块（如 "scripting"）
            if (exp.has("*")) continue; // 存在 export *，跳过
            for (const n of names) {
                if (!exp.has(n)) problems.push(`${rel} 导入了 ${from} 中不存在的 ${n}`);
            }
        }
    }

    assert.deepEqual(problems, [], `存在无法解析的具名导入:\n  ${problems.join("\n  ")}`);
}

// ── C. 入口文件确实引用了直连服务 ─────────────────────────────
function testEntriesReferenceDirect(): void {
    const widget = src("../widget.tsx");
    const index = src("../index.tsx");
    const intents = src("../app_intents.tsx");
    const data = src("../data.ts");

    assert.ok(widget.includes("refreshWbDirectData"), "widget 刷新分发引用直连刷新");
    assert.ok(index.includes("refreshWbDirectData"), "index 引用直连刷新");
    assert.ok(intents.includes("refreshWbDirectData"), "app_intents 引用直连刷新");
    assert.ok(data.includes("refreshWbDirectData"), "data 定义直连刷新");
}

// ── 执行 ───────────────────────────────────────────────────────
const tests: [string, () => Promise<void> | void][] = [
    [".ts 模块可加载", testTsModulesLoad],
    ["具名导入全部可解析", testNamedImportsResolve],
    ["入口引用直连服务", testEntriesReferenceDirect],
    ["入口文件不被其它模块导入", testEntryFilesAreNotImported],
];

let passed = 0;
try {
    for (const [name, fn] of tests) {
        await fn();
        passed++;
        console.log(`  ok  ${name}`);
    }
    console.log(`PASS ${passed} entry checks`);
} catch (error) {
    console.error(`FAIL after ${passed}/${tests.length} checks`);
    console.error((error as Error)?.stack || error);
    process.exitCode = 1;
}
