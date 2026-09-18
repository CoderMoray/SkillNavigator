# demo-skill-improved

HaluCatch-hardened variant of `examples/demo-skill` for local publish/UI checks.

- **slug**: `demo-skill-improved`
- Local HaluCatch (2026-09-18): summary TL;DR ≈ `🔴 1 严重 · ⚠️ 0 注意 · 💡 2 可优化` — the **注意** block should render gray on the skill detail page.

Publish from repo root (API running, logged in):

```bash
skillnav publish examples/demo-skill-improved --wait
```

Then open the skill detail HaluCatch section to verify the three summary cards.
