# skillnav — 配置与鉴权

管理 CLI 与 SkillNavigator 平台的连接与身份。

> **前置**：发布、下载、评分、contributor 管理等命令需有效 API Key。

---

## config add — 添加 profile

```bash
skillnav config add prod --registry https://your-api.example.com
skillnav config add embed --registry https://host/SkillNavigator/api
```

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `name` | ✅ | profile 名称（positional） |
| `--registry` | ✅ | API 根 URL；**可含路径前缀**，CLI 用字符串拼接，勿省略前缀 |

---

## config use / list / test

```bash
skillnav config use prod
skillnav config list
skillnav config test          # 默认 profile
skillnav config test prod     # 指定 profile
```

`config test` 调用 `GET {registry}/health` 验证连通性。

配置文件：`~/.config/skillnav/config.json`（权限 `0600`）。

---

## login — API Key 登录

```bash
skillnav login --api-key sk_你的密钥
skillnav --registry https://custom/api login --api-key sk_…
```

| 参数 | 说明 |
| --- | --- |
| `--api-key` | Web「设置 → API 密钥」创建的一次性密钥 |
| `--registry` | 可选，仅本次登录写入该 registry |

成功后写入当前 profile 的 `apiKey` 与 identity（来自 `GET /auth/me`）。

**CI / 无落盘**：

```bash
export SKILLNAV_API_KEY=sk_…
export SKILLNAV_REGISTRY=http://127.0.0.1:3000
skillnav whoami --no-input
```

---

## logout / whoami

```bash
skillnav logout     # 清除本地 apiKey，不吊销服务端 Key
skillnav whoami     # 显示当前用户名与用户 ID
```

---

## update — 升级 CLI

```bash
skillnav update --check   # 仅检查
skillnav update           # 从 PyPI 升级
```

---

## 常见错误

| 现象 | 处理 |
| --- | --- |
| `not logged in` | 先 `login` 或设置 `SKILLNAV_API_KEY` |
| health 检查失败 | 确认 API 已启动；registry URL 为完整 API 根 |
| 401  Unauthorized | Key 过期/停用；Web 重新创建或启用 Key |

## 参考

- [skillnav](../SKILL.md) — 命令总览
