# Repository Guidelines

Repository guidelines and contributor conventions for developing iOS Scripting App scripts.

## Project Structure & Module Organization

Each top-level directory represents an independent script deployable via Scripting App subscription:

- `<Script Name>/script.json`: Script metadata, entrypoint, icon, version, and subscription `remoteResource`.
- `<Script Name>/index.tsx`: In-app UI entrypoint using `TabView` or list views for status and settings.
- `<Script Name>/widget.tsx`: iOS widget UI and execution lifecycle (`Widget.present`, `Script.exit`).
- `<Script Name>/widget_data.ts` or `apis/`: Data fetching, aggregation, and caching layer.
- `<Script Name>/app_intents.tsx`: AppIntent triggers for widget touch actions and refresh events.
- `<Script Name>/tests/`: Unit and regression test suites with module mocks.
- `WIDGET_GUIDE.md`: In-depth widget architecture guide and pre-release review checklist.

## Build, Test, and Development Commands

This repository does not require a bundling step; scripts run directly inside Scripting App.

- `node --import "./F50 Widget/tests/register.mjs" "./F50 Widget/tests/regression.test.ts"`: Run regression tests using Node.js native test assertions and custom mock loaders.
- `Widget.preview({ family: "systemSmall" })`: In-app debugging method invoked via `index.tsx` to preview widget sizes (`small`, `medium`, `large`).

## Coding Style & Naming Conventions

- **Language**: TypeScript (`.ts`) and TSX (`.tsx`).
- **Formatting**: 2 or 4 spaces indentation per project consistency; trailing semicolons preferred in data/API modules.
- **Components & APIs**: Import UI primitives (`VStack`, `HStack`, `Text`, `Widget`) from `"scripting"`. Use global `Storage` directly (never import `Storage` from `"scripting"`).
- **Colors**: Prefer iOS semantic colors (`systemBlue`, `secondaryLabel`) rather than hardcoded hex codes.
- **Separation of Concerns**: Keep UI rendering inside `widget.tsx`, data normalization in `widget_data.ts`, and network calls in `api.ts`.

## Testing Guidelines

- **Framework**: Node.js ESM with `node:assert/strict`.
- **Mocks**: Mock the `"scripting"` module and network fetch via `tests/loader.mjs` and `tests/scripting.mock.ts`.
- **Naming**: Name regression suites `<name>.test.ts`.
- **Requirements**: Verify state normalization, fallback parsing, unit formatting, and SMS/API error recovery before committing.

## Commit & Pull Request Guidelines

- **Commit Messages**: Follow Conventional Commits (`feat:`, `fix:`, `style:`, `docs:`) or script-prefixed scopes (e.g., `Weibo: ...`, `fix: 小组件深链话题搜索`).
- **Pull Requests**: Explain changes, list affected script directories, verify widget rendering across small/medium/large sizes, and confirm subscription URL consistency in `script.json`.
