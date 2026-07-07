from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "images"

FONT_BOLD_CANDIDATES = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_BOLD_CANDIDATES:
        try:
            return ImageFont.truetype(path, size=size, index=1)
        except Exception:
            try:
                return ImageFont.truetype(path, size=size)
            except Exception:
                continue
    return ImageFont.load_default()


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def mix(a: str, b: str, amount: float) -> tuple[int, int, int]:
    ar, ag, ab = hex_to_rgb(a)
    br, bg, bb = hex_to_rgb(b)
    return (
        round(ar + (br - ar) * amount),
        round(ag + (bg - ag) * amount),
        round(ab + (bb - ab) * amount),
    )


def vertical_gradient(size: tuple[int, int], stops: list[str]) -> Image.Image:
    width, height = size
    image = Image.new("RGB", size)
    pixels = image.load()
    segments = len(stops) - 1
    for y in range(height):
        position = y / max(1, height - 1)
        segment = min(segments - 1, int(position * segments))
        local = position * segments - segment
        color = mix(stops[segment], stops[segment + 1], local)
        for x in range(width):
            pixels[x, y] = color
    return image.convert("RGBA")


def add_texture(image: Image.Image, opacity: int = 18) -> Image.Image:
    width, height = image.size
    noise = Image.effect_noise((width, height), 28).convert("L")
    texture = Image.new("RGBA", image.size, (255, 255, 255, 0))
    texture.putalpha(noise.point(lambda p: min(opacity, max(0, int(p / 255 * opacity)))))
    return Image.alpha_composite(image, texture)


def rounded_shadow(size: tuple[int, int], radius: int, shadow: tuple[int, int, int, int]) -> Image.Image:
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    margin = max(8, radius // 3)
    draw.rounded_rectangle((margin, margin, size[0] - margin, size[1] - margin), radius=radius, fill=shadow)
    return layer.filter(ImageFilter.GaussianBlur(radius // 3))


def draw_brand_symbol(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], primary: str, paper: str, tertiary: str) -> None:
    x0, y0, x1, y1 = box
    width = x1 - x0
    height = y1 - y0
    page = hex_to_rgb(paper)
    ink = hex_to_rgb(primary)
    teal = hex_to_rgb(tertiary)
    stroke = max(5, int(width * 0.048))
    draw.rounded_rectangle((x0 + width * 0.15, y0 + height * 0.13, x1 - width * 0.12, y1 - height * 0.12), radius=int(width * 0.17), fill=page)
    draw.rounded_rectangle((x0 + width * 0.20, y0 + height * 0.19, x1 - width * 0.17, y1 - height * 0.17), radius=int(width * 0.12), outline=ink, width=stroke)
    draw.polygon(
        [
            (x0 + width * 0.62, y0 + height * 0.17),
            (x0 + width * 0.80, y0 + height * 0.17),
            (x0 + width * 0.80, y0 + height * 0.56),
            (x0 + width * 0.71, y0 + height * 0.46),
            (x0 + width * 0.62, y0 + height * 0.56),
        ],
        fill=teal,
    )
    for index, ratio in enumerate((0.35, 0.50)):
        y = y0 + height * ratio
        draw.rounded_rectangle((x0 + width * 0.29, y, x0 + width * (0.57 + index * 0.06), y + height * 0.040), radius=int(width * 0.025), fill=ink)
    draw.arc((x0 + width * 0.24, y0 + height * 0.52, x0 + width * 0.87, y0 + height * 0.98), 200, 346, fill=ink, width=max(7, int(width * 0.070)))
    draw.arc((x0 + width * 0.32, y0 + height * 0.61, x0 + width * 0.82, y0 + height * 0.94), 201, 344, fill=teal, width=max(4, int(width * 0.032)))


def icon_canvas(size: int, palette: dict[str, str], transparent_bg: bool = False, monochrome: bool = False) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0) if transparent_bg else hex_to_rgb(palette["background"]) + (255,))
    draw = ImageDraw.Draw(image)
    if not transparent_bg:
        image = add_texture(image, 8)
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((size * 0.16, size * 0.16, size * 0.84, size * 0.84), radius=int(size * 0.22), fill=hex_to_rgb(palette["surface"]) + (255,))
        draw.rounded_rectangle((size * 0.21, size * 0.24, size * 0.79, size * 0.80), radius=int(size * 0.18), outline=hex_to_rgb(palette["container"]) + (255,), width=max(8, int(size * 0.030)))
    else:
        draw.rounded_rectangle((size * 0.17, size * 0.17, size * 0.83, size * 0.83), radius=int(size * 0.22), fill=hex_to_rgb(palette["surface" if not monochrome else "container"]) + (255,))
        if not monochrome:
            draw.rounded_rectangle((size * 0.22, size * 0.25, size * 0.78, size * 0.79), radius=int(size * 0.17), outline=hex_to_rgb(palette["container"]) + (255,), width=max(8, int(size * 0.030)))

    if monochrome:
        draw_brand_symbol(draw, (int(size * 0.24), int(size * 0.24), int(size * 0.76), int(size * 0.76)), "#FFFFFF", "#FFFFFF", "#FFFFFF")
    else:
        draw_brand_symbol(draw, (int(size * 0.25), int(size * 0.24), int(size * 0.77), int(size * 0.77)), palette["primary"], palette["surface"], palette["tertiary"])
    return image


def save_icon_assets() -> None:
    palette = {
        "background": "#10130E",
        "surface": "#FBF8F2",
        "container": "#D7E9D7",
        "primary": "#151611",
        "tertiary": "#2F6B4F",
    }
    icon = icon_canvas(1024, palette)
    icon.save(ASSETS / "icon.png")
    icon.resize((512, 512), Image.Resampling.LANCZOS).save(ASSETS / "favicon.png")
    icon.resize((700, 700), Image.Resampling.LANCZOS).save(ASSETS / "brand" / "moyu-app-icon.png")
    icon.resize((512, 512), Image.Resampling.LANCZOS).save(ASSETS / "splash-icon.png")
    Image.new("RGBA", (1024, 1024), hex_to_rgb("#F7F3EA") + (255,)).save(ASSETS / "android-icon-background.png")
    icon_canvas(1024, palette, transparent_bg=True).save(ASSETS / "android-icon-foreground.png")
    icon_canvas(1024, {**palette, "container": "#000000"}, transparent_bg=True, monochrome=True).save(ASSETS / "android-icon-monochrome.png")


def save_splash_mark() -> None:
    image = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw_brand_symbol(draw, (92, 82, 420, 428), "#151611", "#FBF8F2", "#2F6B4F")
    image.save(ASSETS / "splash-mark.png")


def draw_wordmark(filename: str = "moyu-wordmark.png", dark: bool = False) -> None:
    image = Image.new("RGBA", (1500, 520), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    title = "#F7F0E4" if dark else "#151611"
    meta = "#CFC2A5" if dark else "#756D60"
    chip = "#D7E9D7" if dark else "#151611"
    chip_text = "#171811" if dark else "#F7F0E4"
    draw_brand_symbol(draw, (64, 82, 354, 372), "#E7D9B7" if dark else "#151611", "#171811" if dark else "#FBF8F2", "#BFD6C3" if dark else "#2F6B4F")
    draw.text((420, 86), "墨屿", fill=title, font=font(148))
    draw.text((430, 258), "INBOX READER", fill=meta, font=font(52))
    draw.rounded_rectangle((420, 348, 842, 416), radius=34, fill=chip)
    draw.text((492, 359), "离线阅读", fill=chip_text, font=font(34))
    image.save(ASSETS / "brand" / filename)


def draw_logo_board() -> None:
    image = vertical_gradient((1200, 720), ["#10130E", "#182018", "#D7E9D7"])
    image = add_texture(image, 10)
    shadow = rounded_shadow((1200, 720), 76, (8, 10, 7, 64))
    card = Image.new("RGBA", (1200, 720), (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    draw.rounded_rectangle((94, 92, 1106, 628), radius=78, fill=(251, 248, 242, 244), outline=(215, 233, 215, 120), width=4)
    draw.rounded_rectangle((154, 156, 432, 434), radius=72, fill=(16, 19, 14, 255))
    draw_brand_symbol(draw, (184, 184, 402, 404), "#151611", "#FBF8F2", "#2F6B4F")
    draw.text((492, 166), "墨屿", fill="#151611", font=font(124))
    draw.text((504, 318), "Inbox Reader", fill="#53635A", font=font(50))
    draw.rounded_rectangle((494, 424, 864, 500), radius=38, fill="#D7E9D7")
    draw.text((550, 440), "离线阅读", fill="#102016", font=font(40))
    image = Image.alpha_composite(image, shadow)
    image = Image.alpha_composite(image, card)
    image.save(ASSETS / "brand" / "moyu-logo-board.png")


def material_background(size: tuple[int, int], palette: dict[str, str]) -> Image.Image:
    image = vertical_gradient(size, palette["gradient"])
    image = add_texture(image, 16)
    draw = ImageDraw.Draw(image, "RGBA")
    width, height = size
    for i in range(5):
        y = int(height * (0.16 + i * 0.17))
        offset = int(math.sin(i * 1.7) * width * 0.10)
        draw.rounded_rectangle(
            (-width * 0.18 + offset, y, width * 1.08 + offset, y + height * 0.11),
            radius=int(height * 0.055),
            fill=hex_to_rgb(palette["ribbon"]) + (34,),
        )
    draw.rounded_rectangle((width * 0.06, height * 0.78, width * 0.94, height * 0.94), radius=int(width * 0.10), fill=hex_to_rgb(palette["container"]) + (46,))
    return image


def material_cover(size: tuple[int, int], palette: dict[str, str]) -> Image.Image:
    image = material_background(size, palette)
    draw = ImageDraw.Draw(image, "RGBA")
    width, height = size
    draw.rounded_rectangle((width * 0.10, height * 0.10, width * 0.90, height * 0.86), radius=int(width * 0.16), fill=hex_to_rgb(palette["surface"]) + (160,), outline=hex_to_rgb(palette["outline"]) + (56,), width=2)
    draw.rounded_rectangle((width * 0.17, height * 0.19, width * 0.47, height * 0.28), radius=int(width * 0.08), fill=hex_to_rgb(palette["container"]) + (230,))
    draw_brand_symbol(draw, (int(width * 0.58), int(height * 0.15), int(width * 0.82), int(height * 0.31)), palette["primary"], palette["surface"], palette["tertiary"])
    for i in range(4):
        y = height * (0.59 + i * 0.055)
        draw.rounded_rectangle((width * 0.18, y, width * (0.80 - i * 0.07), y + height * 0.018), radius=int(height * 0.01), fill=hex_to_rgb(palette["primary"]) + (72,))
    return image


def save_theme_assets() -> None:
    palettes = {
        "mist": {
            "gradient": ["#F7F3EA", "#EFE9DF", "#E7D9B7"],
            "surface": "#FBF8F2",
            "container": "#E7D9B7",
            "ribbon": "#151611",
            "primary": "#151611",
            "tertiary": "#3F6751",
            "outline": "#8A8174",
        },
        "deep": {
            "gradient": ["#10110D", "#171811", "#25261F"],
            "surface": "#171811",
            "container": "#E7D9B7",
            "ribbon": "#E7D9B7",
            "primary": "#E7D9B7",
            "tertiary": "#BFD6C3",
            "outline": "#CFC2A5",
        },
        "reading": {
            "gradient": ["#FFF8F0", "#F5EEE6", "#FFDCC7"],
            "surface": "#FFFCF7",
            "container": "#E7D9B7",
            "ribbon": "#151611",
            "primary": "#151611",
            "tertiary": "#3F6751",
            "outline": "#7E6E64",
        },
    }
    for name, palette in palettes.items():
        material_background((497, 1004), palette).save(ASSETS / "themes" / f"{name}-background.png")
        material_cover((497, 760), palette).save(ASSETS / "themes" / f"{name}-cover.png")
    material_background((1200, 840), palettes["mist"]).save(ASSETS / "themes" / "moyu-material-board.png")


def main() -> None:
    save_icon_assets()
    save_splash_mark()
    draw_wordmark()
    draw_wordmark("moyu-wordmark-light.png", dark=True)
    draw_logo_board()
    save_theme_assets()


if __name__ == "__main__":
    main()
