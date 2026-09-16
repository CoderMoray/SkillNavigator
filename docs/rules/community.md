# 社区协作与可靠性评估规则

## 可靠性评估

平台使用 `tests/*.json` 作为轻量任务集格式：

```json
{
  "name": "basic-task",
  "input": "User request",
  "expectedOutput": ["summary", "suggestions"],
  "forbiddenBehaviors": ["network access", "reading private files"],
  "successCriteria": ["The answer is concise and follows the template"]
}
```

默认评估器为 `halucatch-adapter`：它将发布快照写入临时目录，调用内置
HaluCatch 的五维静态检查（地基、代码风险、规则、护栏、复杂度），并将五个维度
映射为 `taskResults`。这项检查不执行 Skill 内脚本，也不会把报告写入 Skill 包。

`tests/*.json` 的 `static-taskset` 仍保留为回退评估，但**仅在 `HALUCATCH_ENABLED=false`（显式禁用）时启用**。
若 HaluCatch 已启用、只是 Python / vendored 模块不可用，平台会把它当**环境问题**上报为可重试的阶段失败
（`inspectionStatus: interrupted`），不会静默回退成任务集结果。启用时两个 provider 保持相同输出结构：`status`、`score`、`tasksTotal`、
`tasksPassed`、`taskResults`、`findings`。

## Contributor

Contributor 用于标注多人协作关系：

- `owner`：Skill 所有者，**仅在发布时自动设置**，不可通过邀请或手动添加。
- `contributor`：协作贡献者，**仅 Skill Owner** 可通过 API / Web 添加；Contributor 不能邀请其他人。

已移除 `maintainer`、`reviewer` 以及手动指定 `owner` 的能力；历史非 owner 角色会迁移为 `contributor`。

同一名字重复添加时更新角色，不创建重复记录。

## Issue

Issue 类型：

- `bug`
- `security`
- `compatibility`
- `feature`
- `docs`

状态：

- `open`
- `triaged`
- `closed`

当前支持创建和查询，状态流转留到后续管理后台实现。

## Rating

用户评分为 1 到 5 分，可附带版本和评论。平台保存平均分和评分数，榜单展示时不把用户评分和审查分混成同一个分数。

## 榜单

榜单排序口径：

- `downloads`：下载总量。
- `rating`：平均用户评分，评分数作为次级排序。
- `quality` / `security` / `reliability`：按对应分数列排序。⚠️ 这三个分数当前是**占位值**（引擎统一返回 100，不按 finding 或 HaluCatch 计算），因此这三项排序暂无区分度；详见 [review-rubric](./review-rubric.md)。
- `recent`：最近更新时间。
