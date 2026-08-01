# Phase 1 — Shell Complete

## Goal
A Skaffo window that opens, navigates, and feels like the real product — with zero backend.

## Delivered
- Electron shell (custom titlebar, IPC window controls, contextIsolation, no nodeIntegration)
- React 18 + TypeScript + Vite + Tailwind + Zustand + React Flow + Framer Motion + Lucide
- Plugin registry + event bus in `src/core` — the "main rule" enforced from day one
- 8 screens: Dashboard, Projects, Templates, Database Designer, API Designer, Export, Settings, Wizard
- Full design system matching the spec (colors, Inter, 200ms fade/slide/scale, glass)

## Verification
Headless Electron run (`xvfb`), 12 screenshots captured:
- All routes render
- 0 console errors
- Project open/close, schema editing, CRUD generation, export progress all functional on mock state

## Bug found & fixed during Phase 1
Nested `AnimatePresence` + `motion.div` in `App.tsx` left page containers stuck at
`opacity: 0` after route changes. Symptom: blank content area on some navigations.
Fix: animate the route wrapper in exactly one place; page components render a plain `<div>`.
Post-fix, every navigation succeeds on the first click (previously took 3–4 retries).

## Explicitly NOT in Phase 1
- No Python / FastAPI
- No file generation
- No disk writes
- No persistence (state resets on reload)

## Next — Phase 2
1. `engine/` FastAPI app with `/health`, `/projects`, `/generate`
2. PyInstaller sidecar, spawned from `electron/main.cjs`
3. Replace `src/core/mock.ts` with API calls behind the same store interface
   (no UI changes required — that's the point of the architecture)
