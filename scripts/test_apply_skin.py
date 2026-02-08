"""Tests for apply_skin.py cartoon tile generator."""
import builtins
import importlib.util
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Load apply_skin module without executing __main__
_SCRIPT_PATH = Path(__file__).parent / "apply_skin.py"
_spec = importlib.util.spec_from_file_location("apply_skin", _SCRIPT_PATH)
_apply_skin = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_apply_skin)

_ASSETS = Path(__file__).parent.parent / "assets" / "skins"
_RAW_TILE = _ASSETS / "_raw_tiles" / "14" / "2619" / "6331.png"
_CARTOON_TILE = _ASSETS / "cartoon" / "14" / "2619" / "6331.png"
_ASSETS_DIR = str(Path(__file__).parent.parent / "assets")
_VIBE_PATH = str(_ASSETS / "cartoon_vibe.png")


# ---------------------------------------------------------------------------
# lat_lon_to_tile
# ---------------------------------------------------------------------------


def test_lat_lon_to_tile():
    """Tile coordinates for known SF location match expected range."""
    x, y = _apply_skin.lat_lon_to_tile(37.78825, -122.4324, 14)
    assert 2610 < x < 2630
    assert 6320 < y < 6340


def test_lat_lon_to_tile_zoom_14_center():
    """SF center tile matches the pre-generated tile index."""
    x, y = _apply_skin.lat_lon_to_tile(37.78825, -122.4324, 14)
    assert x == 2619
    assert y == 6331


# ---------------------------------------------------------------------------
# Asset existence sanity checks
# ---------------------------------------------------------------------------


def test_cartoon_tiles_exist():
    """Pre-generated cartoon tiles for SF area exist on disk."""
    assert _CARTOON_TILE.exists(), f"Cartoon tile missing: {_CARTOON_TILE}"
    assert _CARTOON_TILE.stat().st_size > 100, "Cartoon tile appears empty"


def test_cartoon_tile_differs_from_raw():
    """Cartoon tile bytes differ from the raw source tile."""
    raw = _RAW_TILE.read_bytes()
    cartoon = _CARTOON_TILE.read_bytes()
    assert raw != cartoon, "Cartoon tile should differ from raw tile"


# ---------------------------------------------------------------------------
# _check_dependencies
# ---------------------------------------------------------------------------


def test_check_dependencies_passes_when_installed():
    """No SystemExit when numpy and Pillow are both installed."""
    _apply_skin._check_dependencies()


def test_check_dependencies_exits_when_numpy_missing():
    """sys.exit is called when numpy is missing."""
    original_import = builtins.__import__

    def _no_numpy(name, *args, **kwargs):
        if name == "numpy":
            raise ImportError("No module named 'numpy'")
        return original_import(name, *args, **kwargs)

    with patch("builtins.__import__", side_effect=_no_numpy):
        with pytest.raises(SystemExit):
            _apply_skin._check_dependencies()


# ---------------------------------------------------------------------------
# apply_skin
# ---------------------------------------------------------------------------


def test_apply_skin_produces_output(tmp_path):
    """apply_skin writes a PNG to the output path."""
    output = tmp_path / "out.png"
    _apply_skin.apply_skin(str(_RAW_TILE), str(_RAW_TILE), str(output))
    assert output.exists()
    assert output.stat().st_size > 100


def test_apply_skin_output_differs_from_input(tmp_path):
    """apply_skin output is visually transformed from the raw input."""
    output = tmp_path / "out.png"
    _apply_skin.apply_skin(str(_RAW_TILE), str(_RAW_TILE), str(output))
    assert output.read_bytes() != _RAW_TILE.read_bytes()


def test_apply_skin_creates_output_directory(tmp_path):
    """apply_skin creates missing parent directories for the output path."""
    output = tmp_path / "deep" / "nested" / "out.png"
    _apply_skin.apply_skin(str(_RAW_TILE), str(_VIBE_PATH), str(output))
    assert output.exists()


# ---------------------------------------------------------------------------
# create_default_vibe_image
# ---------------------------------------------------------------------------


def test_create_default_vibe_image(tmp_path):
    """create_default_vibe_image writes a 256x256 PNG."""
    from PIL import Image

    output = tmp_path / "vibe.png"
    _apply_skin.create_default_vibe_image(str(output))
    assert output.exists()
    img = Image.open(output)
    assert img.size == (256, 256)


def test_create_default_vibe_image_creates_directory(tmp_path):
    """create_default_vibe_image creates missing parent directories."""
    output = tmp_path / "skins" / "vibe.png"
    _apply_skin.create_default_vibe_image(str(output))
    assert output.exists()


# ---------------------------------------------------------------------------
# download_osm_tile
# ---------------------------------------------------------------------------


def test_download_osm_tile_handles_network_error(tmp_path):
    """download_osm_tile returns False when the network fails."""
    output = tmp_path / "tile.png"
    with patch("urllib.request.urlopen", side_effect=Exception("network error")):
        result = _apply_skin.download_osm_tile(14, 2619, 6331, str(output))
    assert result is False


def test_download_osm_tile_success(tmp_path):
    """download_osm_tile returns True and writes data on success."""
    output = tmp_path / "14" / "2619" / "6331.png"
    fake_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
    mock_resp = MagicMock()
    mock_resp.read.return_value = fake_data
    mock_resp.__enter__ = lambda s: s
    mock_resp.__exit__ = MagicMock(return_value=False)
    with patch("urllib.request.urlopen", return_value=mock_resp):
        result = _apply_skin.download_osm_tile(14, 2619, 6331, str(output))
    assert result is True
    assert output.read_bytes() == fake_data


# ---------------------------------------------------------------------------
# generate_sf_tiles
# ---------------------------------------------------------------------------


def test_generate_sf_tiles_processes_all_tiles():
    """generate_sf_tiles calls apply_skin for every tile (43 total)."""
    with patch.object(_apply_skin, "apply_skin") as mock_apply:
        _apply_skin.generate_sf_tiles(_ASSETS_DIR, _VIBE_PATH)
    # zoom 13: 3×3=9, zoom 14: 3×3=9, zoom 15: 5×5=25 → 43 total
    assert mock_apply.call_count == 43


def test_generate_sf_tiles_downloads_when_raw_missing(tmp_path):
    """generate_sf_tiles downloads tiles that don't exist yet."""
    vibe_path = tmp_path / "vibe.png"
    _apply_skin.create_default_vibe_image(str(vibe_path))

    with patch.object(_apply_skin, "download_osm_tile", return_value=False) as mock_dl:
        with patch.object(_apply_skin, "apply_skin") as mock_apply:
            _apply_skin.generate_sf_tiles(str(tmp_path), str(vibe_path))

    # All raw tiles missing → download attempted for every tile
    assert mock_dl.call_count == 43
    # Downloads failed → apply_skin never called
    assert mock_apply.call_count == 0


# ---------------------------------------------------------------------------
# main()
# ---------------------------------------------------------------------------


def test_main_create_vibe(tmp_path):
    """main --create-vibe creates the vibe PNG."""
    vibe_path = str(tmp_path / "vibe.png")
    with patch("sys.argv", ["apply_skin.py", "--create-vibe", "--vibe", vibe_path]):
        _apply_skin.main()
    assert Path(vibe_path).exists()


def test_main_single_tile(tmp_path):
    """main --tile --vibe --output processes a single tile."""
    output = tmp_path / "out.png"
    with patch(
        "sys.argv",
        [
            "apply_skin.py",
            "--tile",
            str(_RAW_TILE),
            "--vibe",
            str(_RAW_TILE),
            "--output",
            str(output),
        ],
    ):
        _apply_skin.main()
    assert output.exists()


def test_main_missing_args_exits():
    """main exits with an error when --tile/--vibe/--output are missing."""
    with patch("sys.argv", ["apply_skin.py"]):
        with pytest.raises(SystemExit):
            _apply_skin.main()


def test_main_generate_sf_tiles(tmp_path):
    """main --generate-sf-tiles invokes generate_sf_tiles."""
    with patch.object(_apply_skin, "generate_sf_tiles") as mock_gen:
        with patch.object(_apply_skin, "create_default_vibe_image"):
            with patch(
                "sys.argv",
                [
                    "apply_skin.py",
                    "--generate-sf-tiles",
                    "--assets-dir",
                    str(tmp_path),
                ],
            ):
                _apply_skin.main()
    mock_gen.assert_called_once()
