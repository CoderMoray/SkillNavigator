# skillnav — 搜索与发现

浏览 Skill 广场与排行榜，查看元数据。

---

## search — 搜索

```bash
skillnav search demo
skillnav search automation --category "Automation"
skillnav --json search keyword
```

| 参数 | 说明 |
| --- | --- |
| `query` | 搜索关键词（positional） |
| `--category` | 分类过滤 |

`search` 只接受以上参数；排序与数量上限属于 `top`（见下）。`--json` 等全局选项须写在子命令**之前**。

公开接口，无需登录。输出会以 `N skills found:` 明确给出结果条数——这样"0 结果"与"被 `--limit` 截断"可以区分。

---

## creators — 创作者列表

```bash
skillnav creators                     # 全部创作者
skillnav creators moray               # 按名称 / handle 过滤
```

## search-users — 按名查用户

`add-contributor` 需要**准确用户名**，不确定时先查（需要登录）：

```bash
skillnav search-users donnia
```

## check-slug — 发布前检查 slug 是否可用

```bash
skillnav check-slug my-skill          # 匿名可用
```

## top — 排行榜

```bash
skillnav top
skillnav --json top --sort downloads --limit 10
```

---

## info — Skill 元数据

```bash
skillnav info my-skill
skillnav --json info my-skill
```

展示名称、描述、分类、贡献者、评分、Issue 数、下载量、可见性等。**不**展开 inspection findings；审查摘要见 `status`，完整报告见 `report`。

---

## 参考

- [skillnav](../SKILL.md)
- [skillnav-publish](skillnav-publish.md) — status / report
