# skillnav — 搜索与发现

浏览 Skill 广场与排行榜，查看元数据。

---

## search — 搜索

```bash
skillnav search demo
skillnav search automation --category "Automation"
skillnav search keyword --json --limit 20
```

| 参数 | 说明 |
| --- | --- |
| `query` | 搜索关键词（positional） |
| `--category` | 分类过滤 |
| `--sort` | 排序（默认 downloads） |
| `--limit` | 结果数量上限 |

公开接口，无需登录。

---

## top — 排行榜

```bash
skillnav top
skillnav top --sort downloads --limit 10 --json
```

---

## info — Skill 元数据

```bash
skillnav info my-skill
skillnav info my-skill --json
```

展示名称、描述、分类、贡献者、评分、Issue 数、下载量、可见性等。**不**展开 review findings；审查摘要见 `status`，完整报告见 `report`。

---

## 参考

- [skillnav](../SKILL.md)
- [skillnav-publish](skillnav-publish.md) — status / report
