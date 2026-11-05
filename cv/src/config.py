"""Configuration constants and environment settings for the FOCV Pipeline."""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from functools import lru_cache

# Standard locations for Tesseract OCR across platforms
TESSERACT_SEARCH_PATHS = [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    os.path.expanduser(r"~\AppData\Local\Programs\Tesseract-OCR\tesseract.exe"),
    "/usr/bin/tesseract",
    "/usr/local/bin/tesseract",
    "/opt/homebrew/bin/tesseract",
]


@lru_cache(maxsize=1)
def find_tesseract_cmd() -> str | None:
    """Locate the tesseract executable on the host system."""
    configured = os.environ.get("TESSERACT_CMD")
    if configured and os.path.isfile(configured):
        return configured
    # Check if already in PATH
    which_cmd = shutil.which("tesseract")
    if which_cmd:
        return which_cmd

    for candidate in TESSERACT_SEARCH_PATHS:
        if os.path.exists(candidate) and os.path.isfile(candidate):
            return candidate
    return None


# Default Pipeline Parameters
DEFAULT_CONFIG = {
    # Shape Detection
    "min_node_area": 1200,          # Minimum component area (px^2)
    "max_node_area_ratio": 0.50,     # Max ratio of total image area for a component
    "min_node_dim": 36,             # Min width and height for a component (px)
    "min_group_area_ratio": 0.12,    # Area threshold ratio for grouping containers
    "nms_iou_threshold": 0.40,      # IoU threshold for component deduplication

    # OCR Processing
    "ocr_dpi_scale": 2.5,           # Scaling factor for targeted component ROI OCR
    "min_ocr_confidence": 30.0,     # Minimum confidence to accept OCR tokens
    "psm_modes": [11, 6, 3],        # Tesseract Page Segmentation Modes to evaluate

    # Connector & Arrowhead Extraction
    "stroke_bin_threshold": 180,    # Exclude faint background grids and drop shadows
    "component_mask_pad": 5,        # Remove borders and adjacent antialiasing
    "text_mask_pad": 3,             # Padding around text to prevent OCR strokes in line skeleton
    "endpoint_snap_radius": 30,     # Maximum visible gap allowed at component attachment
    "arrow_search_window": 22,      # Local window around endpoint to test for arrowhead geometry
    "min_connector_length": 15,     # Minimum path length in pixels for a valid connector

    # Spatial & Containment
    "group_containment_margin": 6,  # Pixel margin tolerance for group containment check
}

