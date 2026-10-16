import assert from "node:assert/strict";
import {
    THEME,
    SPACING,
    RADIUS,
    FONT,
    ACCENT_PRESETS,
    loadAccent,
    saveAccent,
    loadAppearance,
    saveAppearance,
    loadMotion,
    saveMotion,
    softTint,
    resolveAccent,
    accentForScheme,
} from "../theme.ts";

function testSpacingAndRadiusAreOrdered(): void {
    assert.equal(SPACING.xs < SPACING.sm, true);
    assert.equal(SPACING.sm < SPACING.md, true);
    assert.equal(SPACING.md < SPACING.lg, true);
    assert.equal(RADIUS.card >= 8, true);
    assert.equal(RADIUS.pill >= RADIUS.card, true);
}

function testFontScaleIsHIGCompatible(): void {
    assert.equal(FONT.caption >= 10, true);
    assert.equal(FONT.body > FONT.caption, true);
    assert.equal(FONT.title > FONT.body, true);
    assert.equal(FONT.largeTitle > FONT.title, true);
}

function testSemanticColorsHaveBothSchemes(): void {
    for (const key of ["accent", "success", "warning", "danger", "info"] as const) {
        const entry = (THEME.color as any)[key];
        assert.equal(typeof entry.light, "string");
        assert.equal(typeof entry.dark, "string");
        assert.equal(entry.light.startsWith("#"), true);
        assert.equal(entry.dark.startsWith("#"), true);
    }
}

function testAccentPresetsAreNonEmptyAndValid(): void {
    assert.equal(ACCENT_PRESETS.length >= 4, true);
    for (const preset of ACCENT_PRESETS) {
        assert.equal(typeof preset.id, "string");
        assert.equal(preset.id.length > 0, true);
        assert.equal(/^#[0-9A-Fa-f]{6}$/.test(preset.light), true);
        assert.equal(/^#[0-9A-Fa-f]{6}$/.test(preset.dark), true);
    }
}

function testAccentRoundTrip(): void {
    saveAccent("#FF3B30");
    assert.equal(loadAccent(), "#FF3B30");
    saveAccent("");
    assert.equal(loadAccent(), "");
}

function testAppearanceRoundTripAndGuards(): void {
    saveAppearance("dark");
    assert.equal(loadAppearance(), "dark");
    saveAppearance("light");
    assert.equal(loadAppearance(), "light");
    saveAppearance("system");
    assert.equal(loadAppearance(), "system");
    saveAppearance("bogus" as any);
    assert.equal(loadAppearance(), "system");
}

function testMotionRoundTripAndDefault(): void {
    saveMotion("reduced");
    assert.equal(loadMotion(), "reduced");
    saveMotion("full");
    assert.equal(loadMotion(), "full");
    saveMotion("junk" as any);
    assert.equal(loadMotion(), "full");
}

function testResolveAccentFallsBackToDefault(): void {
    assert.equal(resolveAccent(""), THEME.color.accent.light);
    assert.equal(resolveAccent("#123456"), "#123456");
}

function testAccentForSchemePicksSchemeVariant(): void {
    assert.equal(accentForScheme("#123456", "light"), "#123456");
    assert.equal(accentForScheme("#123456", "dark"), "#123456");
    // 默认强调色在深浅色下不同
    assert.notEqual(
        accentForScheme(THEME.color.accent.light, "light"),
        accentForScheme(THEME.color.accent.light, "dark"),
    );
}

function testSoftTintProducesRgba(): void {
    const tint = softTint("#0A84FF", 0.15);
    assert.equal(String(tint).startsWith("rgba("), true);
    assert.equal(String(tint).includes("0.15"), true);
    // 非 hex 输入原样返回，避免静默失真
    assert.equal(softTint("secondaryLabel" as any, 0.2), "secondaryLabel");
}

const tests: Array<[string, () => void]> = [
    ["spacing and radius ordered", testSpacingAndRadiusAreOrdered],
    ["font scale HIG compatible", testFontScaleIsHIGCompatible],
    ["semantic colors both schemes", testSemanticColorsHaveBothSchemes],
    ["accent presets valid", testAccentPresetsAreNonEmptyAndValid],
    ["accent round trip", testAccentRoundTrip],
    ["appearance round trip", testAppearanceRoundTripAndGuards],
    ["motion round trip", testMotionRoundTripAndDefault],
    ["resolve accent fallback", testResolveAccentFallsBackToDefault],
    ["accent per scheme", testAccentForSchemePicksSchemeVariant],
    ["soft tint rgba", testSoftTintProducesRgba],
];

let passed = 0;
try {
    for (const [name, fn] of tests) {
        fn();
        passed += 1;
    }
    console.log(`PASS ${passed} theme checks`);
} catch (error) {
    console.error(`FAIL after ${passed}/${tests.length} checks`);
    console.error((error as Error)?.stack || error);
    process.exitCode = 1;
}
