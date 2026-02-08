#!/usr/bin/env python3
"""
apply_skin.py — Map tile cartoon skin generator

Takes a map tile image and a "vibe" reference image, then applies a cartoon-style
visual effect to the tile. The result is a replacement tile that preserves all street
and geographic structure but has a visually distinct cartoon appearance:
  - Gaussian smoothing with saturation boost for painterly softness
  - Flat, simplified color regions (color quantization / posterization)
  - Subtle vibe color influence from the reference image
  - Brightness boost for vibrant cartoon pop

Algorithm: Gaussian smoothing + posterization + vibe color shift + brightness boost
This approach is chosen over neural style transfer because:
  - No trained ML model required (runs anywhere with Pillow/NumPy)
  - Deterministic output for reproducible tests
  - Preserves street structure reliably
  - Fast enough to batch-generate dozens of tiles

Usage:
    python scripts/apply_skin.py --tile path/to/tile.png --vibe path/to/vibe.png --output out.png
    python scripts/apply_skin.py --generate-sf-tiles  # Generate SF demo tiles
"""

import argparse
import math
import os
import sys
import urllib.request
from pathlib import Path


def _check_dependencies():
    """Check that required dependencies are available."""
    missing = []
    try:
        import numpy  # noqa: F401
    except ImportError:
        missing.append("numpy")
    try:
        from PIL import Image  # noqa: F401
    except ImportError:
        missing.append("Pillow")
    if missing:
        print(f"Missing dependencies: {', '.join(missing)}")
        print(f"Install with: pip install {' '.join(missing)}")
        sys.exit(1)


def apply_skin(tile_path: str, vibe_path: str, output_path: str) -> None:
    """
    Apply cartoon skin to a map tile.

    The algorithm produces a flat-color cartoon style:
    1. Gaussian blur smoothing with saturation boost for painterly softness
    2. Posterize to reduce color palette to flat cartoon regions (4-bit)
    3. Extract dominant colors from vibe image and shift palette (subtle 15%)
    4. Brightness boost (1.1x + 5) for vibrant cartoon pop

    Args:
        tile_path: Path to input map tile PNG (ideally 256x256)
        vibe_path: Path to vibe reference image (any size)
        output_path: Path where the skinned tile will be saved
    """
    import numpy as np
    from PIL import Image, ImageEnhance, ImageFilter

    # Load images
    tile_img = Image.open(tile_path).convert("RGB")
    vibe_img = Image.open(vibe_path).convert("RGB")

    # Step 1: Smooth with edge preservation (simulate bilateral filter)
    # Use alternating smooth + sharpen to flatten textures while keeping major edges
    smoothed = tile_img.copy()
    for _ in range(2):
        blurred = smoothed.filter(ImageFilter.GaussianBlur(radius=1.0))
        smoothed = blurred

    # Boost saturation for vivid cartoon colors
    enhancer = ImageEnhance.Color(smoothed)
    saturated = enhancer.enhance(1.8)

    # Step 2: Posterize for flat cartoon color regions
    # 4 bits = 16 levels per channel (more color variety than 3-bit)
    from PIL import ImageOps
    posterized = ImageOps.posterize(saturated, 4)

    # Step 3: Vibe color influence
    # Extract dominant vibe palette and subtly shift tile hue toward it
    vibe_small = vibe_img.resize((32, 32), Image.LANCZOS)
    vibe_arr = np.array(vibe_small, dtype=np.float32)
    vibe_mean = vibe_arr.mean(axis=(0, 1))

    post_arr = np.array(posterized, dtype=np.float32)
    post_mean = post_arr.mean(axis=(0, 1))

    # Only shift if vibe is significantly different (avoid noisy shift)
    color_distance = np.linalg.norm(vibe_mean - post_mean)
    if color_distance > 20:
        shift = (vibe_mean - post_mean) * 0.15  # Subtle 15% shift
        influenced = np.clip(post_arr + shift, 0, 255).astype(np.uint8)
    else:
        influenced = post_arr.astype(np.uint8)
    influenced_img = Image.fromarray(influenced)

    # Step 4: Final brightness/contrast boost for vibrant cartoon look
    final_arr = np.array(influenced_img, dtype=np.float32)

    # Boost brightness slightly so colors pop (cartoon maps are bright)
    final_arr = np.clip(final_arr * 1.1 + 5, 0, 255)

    result = Image.fromarray(final_arr.astype(np.uint8))

    # Ensure output directory exists
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    result.save(output_path, "PNG")
    print(f"Saved skinned tile: {output_path}")


def lat_lon_to_tile(lat: float, lon: float, zoom: int) -> tuple:
    """Convert lat/lon to tile coordinates."""
    num_tiles = 2 ** zoom
    x = int((lon + 180) / 360 * num_tiles)
    lat_rad = math.radians(lat)
    y = int((1 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2 * num_tiles)
    return (x, y)


def download_osm_tile(z: int, x: int, y: int, output_path: str) -> bool:
    """Download a tile from OpenStreetMap tile server."""
    url = f"https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    headers = {"User-Agent": "FogOfDog/1.0 (map skin development)"}
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as response:
            with open(output_path, "wb") as f:
                f.write(response.read())
        print(f"Downloaded tile: z={z} x={x} y={y} -> {output_path}")
        return True
    except Exception as e:
        print(f"Failed to download tile z={z} x={x} y={y}: {e}")
        return False


def generate_sf_tiles(assets_dir: str, vibe_path: str) -> None:
    """
    Generate cartoon tiles for San Francisco test area.
    Covers the GPS injection test location (37.78825, -122.4324) and surrounding area.
    """
    center_lat, center_lon = 37.78825, -122.4324

    # Generate tiles at zoom levels 13, 14, and 15
    zoom_configs = [
        (13, 1),  # 1-tile padding at zoom 13
        (14, 1),  # 1-tile padding at zoom 14
        (15, 2),  # 2-tile padding at zoom 15
    ]

    raw_dir = Path(assets_dir) / "skins" / "_raw_tiles"
    cartoon_dir = Path(assets_dir) / "skins" / "cartoon"

    for zoom, padding in zoom_configs:
        cx, cy = lat_lon_to_tile(center_lat, center_lon, zoom)
        print(f"\nGenerating zoom={zoom} tiles (center tile: {cx},{cy})")
        for dx in range(-padding, padding + 1):
            for dy in range(-padding, padding + 1):
                x, y = cx + dx, cy + dy
                raw_path = str(raw_dir / str(zoom) / str(x) / f"{y}.png")
                output_path = str(cartoon_dir / str(zoom) / str(x) / f"{y}.png")

                if not os.path.exists(raw_path):
                    if not download_osm_tile(zoom, x, y, raw_path):
                        continue

                apply_skin(raw_path, vibe_path, output_path)

    print("\nTile generation complete!")


def create_default_vibe_image(output_path: str) -> None:
    """Create a simple cartoon vibe reference image if none provided."""
    from PIL import Image, ImageDraw

    # Create a colorful cartoon-style reference image with bright primary colors
    img = Image.new("RGB", (256, 256), (255, 255, 200))
    draw = ImageDraw.Draw(img)

    # Bold cartoon colors: bright primaries with dark outlines
    colors = [
        (255, 230, 50),  # Yellow
        (80, 210, 120),  # Green
        (100, 170, 250),  # Blue
        (255, 120, 100),  # Red-pink
        (200, 160, 255),  # Purple
        (255, 180, 50),  # Orange
    ]
    block_size = 85
    for i, color in enumerate(colors):
        x0, y0 = (i % 3) * block_size, (i // 3) * block_size
        draw.rectangle([x0, y0, x0 + block_size - 2, y0 + block_size - 2], fill=color)
    # Add dark outlines for cartoon feel
    for i in range(0, 256, block_size):
        draw.line([(i, 0), (i, 255)], fill=(40, 40, 40), width=3)
        draw.line([(0, i), (255, i)], fill=(40, 40, 40), width=3)

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    img.save(output_path, "PNG")
    print(f"Created default vibe image: {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Apply cartoon skin to a map tile or generate SF demo tiles"
    )
    parser.add_argument("--tile", help="Path to input tile PNG")
    parser.add_argument("--vibe", help="Path to vibe reference PNG")
    parser.add_argument("--output", help="Path for output skinned tile PNG")
    parser.add_argument(
        "--generate-sf-tiles",
        action="store_true",
        help="Generate cartoon tiles for SF test area",
    )
    parser.add_argument(
        "--assets-dir",
        default="assets",
        help="Path to assets directory (default: assets/)",
    )
    parser.add_argument(
        "--create-vibe",
        action="store_true",
        help="Create a default cartoon vibe image",
    )

    args = parser.parse_args()

    _check_dependencies()

    if args.create_vibe:
        vibe_path = args.vibe or "assets/skins/cartoon_vibe.png"
        create_default_vibe_image(vibe_path)
        return

    if args.generate_sf_tiles:
        vibe_path = args.vibe or "assets/skins/cartoon_vibe.png"
        if not os.path.exists(vibe_path):
            print(f"Vibe image not found at {vibe_path}. Creating default...")
            create_default_vibe_image(vibe_path)
        generate_sf_tiles(args.assets_dir, vibe_path)
        return

    if not args.tile or not args.vibe or not args.output:
        parser.error("--tile, --vibe, and --output are required for single tile processing")

    apply_skin(args.tile, args.vibe, args.output)


if __name__ == "__main__":
    main()
