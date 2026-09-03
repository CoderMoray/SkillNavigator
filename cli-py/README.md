# skillnav

Official CLI client for the Skill management platform (MonoSkillNavigator).

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
skillnav review examples/demo-skill
skillnav publish examples/demo-skill --dry-run
skillnav download demo-skill -o /tmp/demo.zip
skillnav update              # upgrade when PyPI has a newer release
skillnav update --check      # check only, do not install
```

Global flags: `--registry`, `--profile`, `--json`, `--no-input`.

Configuration: `~/.config/skillnav/config.json` (multi-profile; stores `apiKey` per profile).

Environment: `SKILLNAV_REGISTRY`, `SKILLNAV_PROFILE`, `SKILLNAV_API_KEY` (legacy alias: `SKILLNAV_TOKEN`).

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
