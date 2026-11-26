import io
import math
import os
import urllib.request
from PIL import Image, ImageDraw

TYPE_IDS = {
    1: "normal",
    2: "fighting",
    3: "flying",
    4: "poison",
    5: "ground",
    6: "rock",
    7: "bug",
    8: "ghost",
    9: "steel",
    10: "fire",
    11: "water",
    12: "grass",
    13: "electric",
    14: "psychic",
    15: "ice",
    16: "dragon",
    17: "dark",
    18: "fairy",
}

SV_BANNER_URL = (
    "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/types/"
    "generation-ix/scarlet-violet/{type_id}.png"
)


def extract_sv_type_emblem(type_id: int) -> Image.Image:
    url = SV_BANNER_URL.format(type_id=type_id)
    with urllib.request.urlopen(url, timeout=15) as resp:
        data = resp.read()

    banner = Image.open(io.BytesIO(data)).convert("RGBA")
    bg_r, bg_g, bg_b, _ = banner.getpixel((48, 20))

    # Extract pure white symbol mask from left circular area (x < 54)
    sym_mask = Image.new("L", (54, banner.height), 0)
    for y in range(banner.height):
        for x in range(54):
            r, g, b, a = banner.getpixel((x, y))
            if a > 30:
                dist = math.sqrt((r - bg_r) ** 2 + (g - bg_g) ** 2 + (b - bg_b) ** 2)
                if dist > 45 and (r + g + b) > 480:
                    val = min(255, int(a * min(1.0, (dist - 35) / 140)))
                    sym_mask.putpixel((x, y), val)

    bbox = sym_mask.getbbox()
    if bbox:
        sym_mask = sym_mask.crop(bbox)

    # Render crisp circular badge at 4x supersampling (512 -> 128)
    ss = 512
    canvas = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    dark_r = max(0, int(bg_r * 0.72))
    dark_g = max(0, int(bg_g * 0.72))
    dark_b = max(0, int(bg_b * 0.72))
    light_r = min(255, int(bg_r * 1.18 + 20))
    light_g = min(255, int(bg_g * 1.18 + 20))
    light_b = min(255, int(bg_b * 1.18 + 20))

    draw.ellipse((16, 16, ss - 16, ss - 16), fill=(dark_r, dark_g, dark_b, 255))
    draw.ellipse((28, 28, ss - 28, ss - 28), fill=(bg_r, bg_g, bg_b, 255))
    draw.ellipse((34, 34, ss - 34, ss - 34), outline=(light_r, light_g, light_b, 140), width=10)

    # Scale symbol proportionally into center (~290px box)
    target_box = 286
    w, h = sym_mask.size
    scale = min(target_box / max(1, w), target_box / max(1, h))
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    scaled_mask = sym_mask.resize((new_w, new_h), Image.Resampling.LANCZOS)

    white_layer = Image.new("RGBA", (new_w, new_h), (255, 255, 255, 255))
    white_layer.putalpha(scaled_mask)

    paste_x = (ss - new_w) // 2
    paste_y = (ss - new_h) // 2
    canvas.alpha_composite(white_layer, (paste_x, paste_y))

    return canvas.resize((128, 128), Image.Resampling.LANCZOS)


def polygon_points(cx: float, cy: float, radius: float, sides: int, rot_deg: float = -90.0) -> list[tuple[float, float]]:
    pts = []
    for i in range(sides):
        angle = math.radians(rot_deg + (360.0 * i) / sides)
        pts.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    return pts


def star_points(cx: float, cy: float, outer_r: float, inner_r: float, tips: int = 4, rot_deg: float = -90.0) -> list[tuple[float, float]]:
    pts = []
    for i in range(tips * 2):
        r = outer_r if i % 2 == 0 else inner_r
        angle = math.radians(rot_deg + (180.0 * i) / tips)
        pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    return pts


def draw_rarity_badge(kind: str) -> Image.Image:
    ss = 512
    cx, cy = ss / 2, ss / 2
    img = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    configs = {
        "common": {
            "sides": 6,
            "outer": (100, 116, 139, 255),
            "mid": (148, 163, 184, 255),
            "inner": (203, 213, 225, 255),
            "rot": 0.0,
        },
        "uncommon": {
            "sides": 4,
            "outer": (5, 150, 105, 255),
            "mid": (16, 185, 129, 255),
            "inner": (110, 231, 183, 255),
            "rot": -90.0,
        },
        "rare": {
            "sides": 6,
            "outer": (29, 78, 216, 255),
            "mid": (59, 130, 246, 255),
            "inner": (147, 197, 253, 255),
            "rot": -90.0,
        },
        "super_rare": {
            "sides": 8,
            "outer": (126, 34, 206, 255),
            "mid": (168, 85, 247, 255),
            "inner": (216, 180, 254, 255),
            "rot": -22.5,
        },
        "legendary": {
            "sides": 4,
            "outer": (180, 83, 9, 255),
            "mid": (245, 158, 11, 255),
            "inner": (254, 240, 138, 255),
            "rot": -90.0,
        },
        "mega": {
            "sides": 8,
            "outer": (190, 18, 60, 255),
            "mid": (244, 63, 94, 255),
            "inner": (253, 164, 175, 255),
            "rot": 0.0,
        },
    }

    if kind == "shiny":
        d.ellipse((32, 32, ss - 32, ss - 32), fill=(180, 120, 10, 75))
        d.polygon(star_points(cx, cy, 224, 72, tips=4, rot_deg=-90.0), fill=(234, 179, 8, 255))
        d.polygon(star_points(cx, cy, 186, 56, tips=4, rot_deg=-90.0), fill=(250, 204, 21, 255))
        d.polygon(star_points(cx, cy, 112, 32, tips=4, rot_deg=-90.0), fill=(254, 249, 195, 255))
        # Accent mini sparkle top-right
        d.polygon(star_points(395, 122, 48, 14, tips=4, rot_deg=-90.0), fill=(254, 240, 138, 255))
        return img.resize((128, 128), Image.Resampling.LANCZOS)

    cfg = configs[kind]
    sides = cfg["sides"]
    rot = cfg["rot"]
    d.polygon(polygon_points(cx, cy, 232, sides, rot), fill=cfg["outer"])
    d.polygon(polygon_points(cx, cy, 200, sides, rot), fill=cfg["mid"])
    d.polygon(polygon_points(cx, cy, 122, sides, rot), fill=cfg["inner"])

    # Subtle facet lines from inner vertices to outer vertices
    outer_pts = polygon_points(cx, cy, 200, sides, rot)
    inner_pts = polygon_points(cx, cy, 122, sides, rot)
    for (ox, oy), (ix, iy) in zip(outer_pts, inner_pts):
        d.line([(ix, iy), (ox, oy)], fill=(255, 255, 255, 110), width=6)

    if kind in ("legendary", "mega"):
        d.polygon(star_points(cx, cy, 86, 26, tips=4, rot_deg=-90.0), fill=(255, 255, 255, 235))

    return img.resize((128, 128), Image.Resampling.LANCZOS)


def main() -> None:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    types_dir = os.path.join(root, "public", "types")
    badges_dir = os.path.join(root, "public", "badges")
    os.makedirs(types_dir, exist_ok=True)
    os.makedirs(badges_dir, exist_ok=True)

    for type_id, slug in TYPE_IDS.items():
        emblem = extract_sv_type_emblem(type_id)
        out_path = os.path.join(types_dir, f"{slug}.png")
        emblem.save(out_path, format="PNG", optimize=True)
        print(f"Type icon: {out_path} ({os.path.getsize(out_path)} bytes)")

    for rarity_key in ("common", "uncommon", "rare", "super_rare", "legendary", "mega", "shiny"):
        badge = draw_rarity_badge(rarity_key)
        out_path = os.path.join(badges_dir, f"rar_{rarity_key}.png")
        badge.save(out_path, format="PNG", optimize=True)
        print(f"Rarity badge: {out_path} ({os.path.getsize(out_path)} bytes)")


if __name__ == "__main__":
    main()
