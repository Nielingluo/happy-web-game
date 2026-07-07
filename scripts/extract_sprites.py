"""Extract individual sprites from the hand-drawn source image."""
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(
    r"C:\Users\njm\AppData\Roaming\Cursor\User\workspaceStorage"
    r"\f2da7a879ef746e5ec881632ad2d8745\images"
    r"\c069908c9ebd0c514100d8a21bd959bf-5a274f17-e04f-441c-aa1b-625e0bc5b45c.png"
)
OUT = Path(__file__).resolve().parent.parent / "assets" / "sprites"

# (left, top, right, bottom) — tuned for 768×1024 source
CROPS = {
    "eye_bug": (85, 18, 300, 175),
    "dog_face": (368, 95, 685, 348),
    "giant_eye": (52, 182, 300, 455),
    "happy_fish": (230, 290, 430, 415),
    "spiky_puff": (450, 338, 675, 515),
    "toothy_monster": (52, 518, 285, 725),
    "rabbit_head": (310, 728, 510, 868),
    "big_mouth": (200, 835, 580, 988),
    "spiral_snail": (35, 958, 125, 1018),
}


def sample_bg_color(arr: np.ndarray) -> np.ndarray:
    h, w = arr.shape[:2]
    pts = [
        (2, 2),
        (w - 3, 2),
        (2, h - 3),
        (w - 3, h - 3),
        (w // 2, 2),
        (w // 2, h - 3),
    ]
    samples = np.array([arr[y, x, :3] for x, y in pts], dtype=np.float32)
    return samples.mean(axis=0)


def remove_paper_background(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    data = np.array(rgba, dtype=np.float32)
    bg = sample_bg_color(data)
    rgb = data[:, :, :3]
    dist = np.sqrt(np.sum((rgb - bg) ** 2, axis=2))
    gray = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]

    # ink = noticeably darker than local paper OR far from paper color
    ink = (gray < 115) | (dist > 42)
    alpha = np.where(ink, 255, 0).astype(np.float32)

    # soft edge on transition zone
    transition = (dist > 28) & (dist <= 52)
    alpha[transition] = ((dist[transition] - 28) / 24 * 255)

    out = data.astype(np.uint8)
    out[:, :, 3] = np.clip(alpha, 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def trim_transparent(img: Image.Image, padding: int = 8) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        return img
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - padding)
    y0 = max(0, y0 - padding)
    x1 = min(img.width, x1 + padding)
    y1 = min(img.height, y1 + padding)
    return img.crop((x0, y0, x1, y1))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    source = Image.open(SRC)
    source.save(OUT.parent / "source_sketch.png")

    for name, box in CROPS.items():
        cropped = source.crop(box)
        sprite = remove_paper_background(cropped)
        sprite = trim_transparent(sprite, padding=10)
        sprite.save(OUT / f"{name}.png")
        w, h = sprite.size
        print(f"  {name}.png  ->  {w}x{h}")

    print(f"\nDone — {len(CROPS)} sprites saved to {OUT}")


if __name__ == "__main__":
    main()
