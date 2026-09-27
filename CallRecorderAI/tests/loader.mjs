import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "scripting") {
    return { shortCircuit: true, url: new URL("./scripting.mock.ts", import.meta.url).href };
  }

  if (specifier.startsWith(".") && context.parentURL) {
    if (!specifier.endsWith(".ts") && !specifier.endsWith(".tsx") && !specifier.endsWith(".js") && !specifier.endsWith(".mjs")) {
      try {
        const tsUrl = new URL(specifier + ".ts", context.parentURL);
        if (existsSync(fileURLToPath(tsUrl))) {
          return { shortCircuit: true, url: tsUrl.href };
        }
        const tsxUrl = new URL(specifier + ".tsx", context.parentURL);
        if (existsSync(fileURLToPath(tsxUrl))) {
          return { shortCircuit: true, url: tsxUrl.href };
        }
      } catch {
        // fallback
      }
    }
  }

  return nextResolve(specifier, context);
}
