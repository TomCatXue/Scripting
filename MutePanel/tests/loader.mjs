import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Scripting 运行时允许无扩展名导入（如 "./theme"），Node 默认不允许。
// 这里把相对的无扩展名说明符补成实际存在的 .ts / .tsx / .js。
const EXTS = [".ts", ".tsx", ".js", ".mjs"];

export async function resolve(specifier, context, nextResolve) {
    if (specifier === "scripting") {
        return { shortCircuit: true, url: new URL("./scripting.mock.ts", import.meta.url).href };
    }

    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
        const base = new URL(specifier, context.parentURL);
        for (const ext of EXTS) {
            const candidate = new URL(base.href + ext);
            if (existsSync(fileURLToPath(candidate))) {
                return { shortCircuit: true, url: candidate.href };
            }
        }
    }

    return nextResolve(specifier, context);
}
