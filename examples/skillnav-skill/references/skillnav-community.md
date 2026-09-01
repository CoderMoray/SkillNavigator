# skillnav — 社区交互

评分、Issue、contributor 管理。

> **写操作**需登录；contributor 变更仅 **Skill owner**。

---

## rate — 评分

```bash
skillnav rate my-skill --score 5 --comment "很好用"
skillnav rate my-skill --score 4 --version 1.0.0
```

| 参数 | 说明 |
| --- | --- |
| `--score` | 1–5（必填） |
| `--comment` | 可选评论 |
| `--version` | 针对的版本 |

---

## issue / issues

```bash
# 提交 Issue
skillnav issue my-skill --title "安装失败" --type bug --severity high --body "复现步骤…"

# 列出 Issue
skillnav issues my-skill
skillnav issues my-skill --status open
```

`--type`：bug / feature / question 等；`--severity`：low / medium / high / critical。

---

## add-contributor / remove-contributor

```bash
skillnav add-contributor my-skill --username alice
skillnav remove-contributor my-skill --username alice
skillnav remove-contributor my-skill --id <contributor-id>
```

移除 contributor 前须向用户确认；仅 owner 可执行。

---

## 参考

- [skillnav](../SKILL.md)
