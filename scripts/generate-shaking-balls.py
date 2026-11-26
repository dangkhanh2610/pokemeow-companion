import io
import os
import urllib.request
from PIL import Image

BALL_SOURCES = {
    "pokeball": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/dream-world/poke-ball.png",
    "greatball": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/dream-world/great-ball.png",
    "ultraball": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/dream-world/ultra-ball.png",
    "premierball": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/dream-world/premier-ball.png",
    "masterball": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/dream-world/master-ball.png",
}

CANVAS_SIZE = 128
SPRITE_SIZE = 82

# (angle_deg_ccw, shift_x, shift_y, duration_ms)
KEYFRAMES = [
    (0, 0, 0, 70),
    (15, -6, -3, 60),
    (25, -10, -4, 70),
    (13, -5, -2, 60),
    (0, 0, 0, 70),
    (-15, 6, -3, 60),
    (-25, 10, -4, 70),
    (-13, 5, -2, 60),
    (0, 0, 0, 120),
    (18, -7, -3, 55),
    (26, -11, -5, 65),
    (0, 0, 0, 55),
    (-18, 7, -3, 55),
    (-26, 11, -5, 65),
    (-12, 4, -2, 55),
    (0, 0, 0, 160),
]


def rgba_to_transparent_gif_frame(rgba: Image.Image) -> Image.Image:
    alpha = rgba.getchannel("A")
    # Reserve palette index 0 for transparency; quantize RGB into 255 colors
    rgb = rgba.convert("RGB")
    quantized = rgb.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    old_palette = quantized.getpalette() or []

    # Shift palette entries by +1 so index 0 stays reserved for transparency
    shifted_palette = [0, 0, 0] + old_palette[: 255 * 3]
    if len(shifted_palette) < 768:
        shifted_palette += [0] * (768 - len(shifted_palette))

    out = Image.new("P", rgba.size, 0)
    out.putpalette(shifted_palette)

    q_bytes = quantized.tobytes()
    a_bytes = alpha.tobytes()
    merged = bytes(
        (q + 1) if a >= 120 else 0
        for q, a in zip(q_bytes, a_bytes)
    )
    out.frombytes(merged)
    out.info["transparency"] = 0
    return out


def generate_shaking_gif(url: str, output_path: str) -> int:
    with urllib.request.urlopen(url, timeout=15) as resp:
        raw_bytes = resp.read()

    source = Image.open(io.BytesIO(raw_bytes)).convert("RGBA")
    bbox = source.getbbox()
    if bbox:
        source = source.crop(bbox)
    source.thumbnail((SPRITE_SIZE, SPRITE_SIZE), Image.Resampling.LANCZOS)

    frames: list[Image.Image] = []
    durations: list[int] = []

    for angle, dx, dy, duration in KEYFRAMES:
        rotated = source.rotate(
            angle,
            resample=Image.Resampling.BICUBIC,
            expand=True,
        )
        canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
        paste_x = (CANVAS_SIZE - rotated.width) // 2 + dx
        paste_y = (CANVAS_SIZE - rotated.height) // 2 + dy
        canvas.alpha_composite(rotated, (paste_x, paste_y))

        frames.append(rgba_to_transparent_gif_frame(canvas))
        durations.append(duration)

    frames[0].save(
        output_path,
        format="GIF",
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        transparency=0,
        disposal=2,
        optimize=False,
    )
    return os.path.getsize(output_path)


def main() -> None:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(root, "public", "balls")
    os.makedirs(out_dir, exist_ok=True)

    for ball_id, url in BALL_SOURCES.items():
        out_path = os.path.join(out_dir, f"shake-{ball_id}.gif")
        size = generate_shaking_gif(url, out_path)
        print(f"Generated {out_path} ({size} bytes, {len(KEYFRAMES)} frames)")


if __name__ == "__main__":
    main()
