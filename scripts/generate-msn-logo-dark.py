"""Generate a dark-theme variant of msn-logo.png (color remap only)."""

from __future__ import annotations

import colorsys
import shutil
from pathlib import Path

from PIL import Image
import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE = REPO_ROOT / "packages/MailManager/templates/msn-logo.png"
OUTPUTS = [
    REPO_ROOT / "packages/MailManager/templates/msn-logo-dark.png",
    REPO_ROOT / "apps/web/public/branding/msn-logo-dark.png",
]


def adjust_for_dark(r: int, g: int, b: int, a: int) -> tuple[int, int, int, int]:
    if a < 8:
        return r, g, b, a

    h, lightness, saturation = colorsys.rgb_to_hls(r / 255.0, g / 255.0, b / 255.0)
    new_lightness = min(0.98, 0.18 + (max(lightness, 0.001) ** 0.58) * 0.80)

    if lightness < 0.12:
        new_saturation = min(1.0, max(saturation, 0.55) * 1.08)
    elif lightness < 0.45:
        new_saturation = min(1.0, saturation * 1.06 + 0.03)
    else:
        new_saturation = min(1.0, saturation * 1.02)

    nr, ng, nb = colorsys.hls_to_rgb(h, new_lightness, new_saturation)
    return int(round(nr * 255)), int(round(ng * 255)), int(round(nb * 255)), a


def main() -> None:
    image = Image.open(SOURCE).convert("RGBA")
    pixels = np.array(image, dtype=np.uint8)
    remapped = np.array(
        [adjust_for_dark(*pixel) for pixel in pixels.reshape(-1, 4)],
        dtype=np.uint8,
    ).reshape(pixels.shape)
    result = Image.fromarray(remapped)

    for output in OUTPUTS:
        output.parent.mkdir(parents=True, exist_ok=True)
        result.save(output)
        if output != OUTPUTS[0]:
            continue
        print(f"Wrote {output.relative_to(REPO_ROOT)}")

    print(f"Synced to {OUTPUTS[1].relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
