# 开发规则（DEV.md）

本文件汇总本仓库的验证门槛与代码规则。多数规则来自真实踩坑（例如：root typecheck 曾长期不覆盖 `apps/web/app`，直到 `next build` 才暴露类型错误），请提交前按本文执行。

## 一、验证门槛：改什么，跑什么

分层校验链（从快到慢）：

```
npm run lint        # root tsc + web tsc + eslint（--max-warnings=0，零告警容忍）
npm run test        # vitest 单元/集成（不含 smoke）
npm run test:smoke  # 自动拉起 dev API 跑 tests/smoke.test.ts（需本地 PG）
npm run build:web   # next build：web 侧最终类型与编译门槛（最严格）
npm run test:e2e    # Playwright，自动拉起 API + Web（需 PG/MinIO + Chrome）
```

| 改动范围 | 必跑 | 建议加跑 |
|---|---|---|
| 任何 TS/TSX 代码 | `npm run lint` | — |
| `packages/*`、`apps/api` 逻辑 | `npm run lint` + `npm run test` | 涉及发布链时 `npm run test:smoke` |
| `apps/web/app/**`（页面/组件） | `npm run lint` + `npm run build:web` | `npm run test:e2e` |
| `cli-py/**`（Python CLI） | `ruff check` + `mypy` + `pytest`（`pip install -e "cli-py[dev]"` 后） | — |
| 品牌名 / BRAND_NAME 相关 | `npm run build:web`（确认产物内联 + `public/usage/` 产物同步） | — |

要点：

- **`npm run lint` ≠ `next build`**。root `tsconfig` 只覆盖 `apps/*/src`、`packages/*/src`；App Router 页面靠 web workspace 的 tsc（已串入 lint 链）与 `next build` 双重兜底。改页面必须以 `build:web` 收尾验证。
- `npm run lint` 已配置 `--max-warnings=0`：**任何新增 warning 都会失败**，不允许"先留个告警以后再说"。
- `test:smoke` / `test:e2e` 会自动拉起所需服务并在结束后清理，无需手动起 `dev:api` / `dev:web`；但本地 PG（含种子）与 MinIO 需提前就绪。

## 二、代码规则（ESLint 零告警）

当前 lint 是零告警门槛，以下规则没有豁免空间：

1. **不写 `any`**。动态结构（如 DB row、第三方响应）用具体类型、泛型或 `unknown` + 收窄建模。参考 `packages/storage/src/store/postgres.ts` 的 row 类型化写法。
2. **effect 内不要同步 `setState`**（`react-hooks/set-state-in-effect`）。按场景替换：
   - 初值依赖外部数据 → `useState(() => initValue)` 惰性初始化；
   - props/上下文变化需要重置本地状态 → React 官方"渲染期基于前值重置"模式（保存前值引用，变化时在渲染中重置，guard 防死循环）；
   - 值可以从 props/URL 直接算出 → 彻底删掉 state，改为派生常量。
   参考实现：`apps/web/app/login/page.tsx`（URL 一次性提示 = 派生 + 已关闭集合 + 签名变化渲染期重置）、`apps/web/app/verify-email/page.tsx`（no-token 惰性初始化）。
3. **render 期不写 ref、不创建组件**。同步最新回调用 effect 写 ref（见 `apps/web/components/PublishNoticeToast.tsx`）；动态图标等来自模块级稳定映射的组件，保留一处 `eslint-disable-next-line` 并写明理由。
4. **无用代码即删**。`no-unused-vars` 报错的 import/变量直接删除；仅"有意未用"的占位参数/解构用 `_` 前缀命名（这是本仓库惯例，lint 已配置忽略）。
5. ESLint 无法识别闭包内重新赋值导致的 `prefer-const` 误报：保留 `let` 并加 `eslint-disable-next-line prefer-const` + 一行注释说明（见 `packages/evaluator/src/index.ts` 的 timeout 处理）。禁止为了消警把 `let` 改成 `const` 导致运行错误。

## 三、品牌名与生成产物

- 一切用户可见品牌名经 `BRAND_NAME` 环境变量注入（`apps/web/lib/brand-name.ts` 等），**禁止硬编码**品牌字符串。
- `apps/web/public/usage/`、`.next/types` 等是构建/prebuild 生成物，**不要手工编辑**；出现 diff 属预期时用构建产物提交（参考 usage 产物同步提交 `af19586`）。

## 四、提交纪律

- 一个 commit 做一件事；修复类 commit 说明根因与修法（参考 `9ca81a0` 的 message 风格）。
- 引入新依赖/新规则/新脚本时，同步更新本文件与 `README.md`。
- 提交前最低验证线：`npm run lint` 全绿；触碰 web 页面再加 `npm run build:web`。
