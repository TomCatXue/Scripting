export async function resolve(specifier, context, nextResolve) {
    if (specifier === "scripting") {
        return { shortCircuit: true, url: new URL("./scripting.mock.ts", import.meta.url).href };
    }
    if (specifier === "./api" && context.parentURL) {
        return { shortCircuit: true, url: new URL("api.ts", context.parentURL).href };
    }
    return nextResolve(specifier, context);
}
