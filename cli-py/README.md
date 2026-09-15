# skillnav

Official CLI client for the Skill management platform (SkillNavigator).

Specification: `docs/cli-design.md` in the platform repository.

## Install

```bash
pip install skillnav -i https://mirrors.aliyun.com/pypi/simple/
# or from this repo:
pip install -e "cli-py[dev]"
```

## Usage

```bash
skillnav --version
skillnav config test
# Create an API key in the Web UI (Account → API Keys), then:
skillnav login --api-key sk_...
skillnav search demo
skillnav info demo-skill
skillnav publish examples/demo-skill --dry-run
skillnav download demo-skill -o /tmp/demo.zip
skillnav update              # upgrade to the latest release
skillnav update --check      # check only, do not install
```

Global flags: `--registry`, `--profile`, `--json`, `--no-input`.

Configuration: `~/.config/skillnav/config.json` (multi-profile; stores `apiKey` per profile).

Environment: `SKILLNAV_REGISTRY`, `SKILLNAV_PROFILE`, `SKILLNAV_API_KEY` (legacy alias: `SKILLNAV_TOKEN`).

## Upgrade and version check

Release lookups try **PyPI first** (`pypi.org/pypi/skillnav/json`) and fall
back to the **Aliyun simple index** when PyPI times out or fails. Explicit
`skillnav update` / `update --check` wait up to 10s per source; if both
fail, the error lists each source's failure.

On top of that, an interactive command performs a **daily best-effort check**
and prints a one-line hint to stderr when a newer release exists:

```
Update available: 0.4.8 -> 0.4.9 (run: skillnav update)
```

- The hint is **interactive-only** and plain ASCII (same wording as
  `update --check`): it is skipped for `--json` and whenever stderr is not a
  TTY — pipes, CI jobs and agent harnesses stay silent, so machine-read
  output is never polluted.

- The result is cached in `~/.config/skillnav/update-check.json`; the
  network is touched at most once per 24h (a failed lookup also backs off
  for 24h, so offline/air-gapped hosts wait at most once a day).
- **A given release is announced at most once, ever.** The hint is driven by
  a new release appearing, not by time: staying on an older version goes
  permanently silent for that version, and only a newer `latest`
  (0.4.9 → 0.5.0) announces again. So you are never nagged about the same
  version day after day.
- A missed hint is never fatal: `skillnav --version` prints the same hint to
  stderr (its stdout stays a single parseable version line), and
  `skillnav update` / `update --check` always perform a real lookup and show
  the result.
- The daily lookup uses a short timeout (default 3s,
  `SKILLNAV_UPDATE_CHECK_TIMEOUT` seconds to change).
- The hint goes to **stderr only** — `--json` output on stdout stays clean.
- Disable entirely with `SKILLNAV_UPDATE_CHECK=off`; editable installs
  (development checkouts) skip the check automatically.
- The check only notifies; upgrades stay explicit (`skillnav update`),
  which handles pip / pipx installs and refuses editable installs.
- The package version has a single source of truth:
  `skillnav/__init__.py` `__version__` (read by `pyproject.toml` via a
  dynamic attr), so the wheel and the CLI can never disagree.

## Test

Requires a running API at `http://127.0.0.1:3000` (`npm run dev:api`):

```bash
pip install -e "cli-py[dev]"
npm run skillnav:test
```

Unit tests only (no API):

```bash
pytest tests/skillnav -v --ignore=tests/skillnav/test_integration.py
```

## License

Apache-2.0
