# skillnav

Official CLI client for the Skill management platform (MonoSkillNavigator).

Specification: `docs/cli-design.md` in the platform repository.

## Install

```bash
pipx install skillnav
# or from this repo:
pip install -e "cli-py[dev]"
```

## Usage

```bash
skillnav --version
skillnav config test
skillnav login --username alice --password password123
skillnav search demo
skillnav info demo-skill
skillnav review examples/demo-skill
skillnav publish examples/demo-skill --dry-run
skillnav download demo-skill -o /tmp/demo.zip
```

Global flags: `--registry`, `--profile`, `--json`, `--no-input`.

Configuration: `~/.config/skillnav/config.json` (multi-profile).

Environment: `SKILLNAV_REGISTRY`, `SKILLNAV_PROFILE`, `SKILLNAV_TOKEN`.

## Test

Requires a running API at `http://127.0.0.1:3000` (`npm run dev:api`):

```bash
cd cli-py
pip install -e ".[dev]"
pytest -v
```

## License

Apache-2.0
