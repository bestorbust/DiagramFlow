"""Image preprocessing, background estimation, and contrast normalization."""

from __future__ import annotations

import cv2
import numpy as np


class PreprocessedImage:
    """Container for multi-representation preprocessed diagram image."""

    def __init__(self, original_bgr: np.ndarray):
        if original_bgr is None or original_bgr.size == 0:
            raise ValueError("Input image is empty or cannot be read.")

        self.original_bgr = original_bgr
        self.height, self.width = original_bgr.shape[:2]
        self.image_area = self.height * self.width

        # Grayscale
        self.gray = cv2.cvtColor(original_bgr, cv2.COLOR_BGR2GRAY)

        # HSV representation for color and saturation analysis
        self.hsv = cv2.cvtColor(original_bgr, cv2.COLOR_BGR2HSV)

        # Detect dominant background luminance
        # Sample border pixels (borders almost always contain the background canvas)
        top_edge = self.gray[0:max(5, int(self.height * 0.02)), :]
        bot_edge = self.gray[min(self.height - 5, int(self.height * 0.98)):, :]
        left_edge = self.gray[:, 0:max(5, int(self.width * 0.02))]
        right_edge = self.gray[:, min(self.width - 5, int(self.width * 0.98)):]
        border_pixels = np.concatenate([
            top_edge.flatten(),
            bot_edge.flatten(),
            left_edge.flatten(),
            right_edge.flatten()
        ])
        self.bg_median_gray = float(np.median(border_pixels))
        self.is_dark_background = self.bg_median_gray < 110

        # Contrast-enhanced grayscale via CLAHE
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        self.enhanced_gray = clahe.apply(self.gray)

    def local_ocr_image(self) -> np.ndarray:
        """Normalize filled dark regions independently of the canvas polarity."""
        gray = 255 - self.gray if self.is_dark_background else self.gray.copy()
        dark = (gray < 145).astype(np.uint8) * 255
        fills = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        fills = cv2.morphologyEx(fills, cv2.MORPH_OPEN, np.ones((17, 17), np.uint8))
        seeds=cv2.erode(dark,np.ones((11,11),np.uint8))
        count,regions=cv2.connectedComponents(fills)
        valid=np.unique(regions[seeds>0]);valid=valid[valid!=0]
        fills=np.isin(regions,valid).astype(np.uint8)*255
        result = gray.copy()
        result[fills > 0] = 255 - gray[fills > 0]
        return result

    def representations(self) -> dict:
        """Lazily produce complementary views without discarding the RGB source."""
        normalized = 255 - self.gray if self.is_dark_background else self.gray
        return {
            "gray": self.gray, "contrast": self.enhanced_gray,
            "local_polarity": self.local_ocr_image(),
            "adaptive_strokes": cv2.adaptiveThreshold(normalized, 255,
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 12),
            "edges": cv2.Canny(normalized, 40, 120),
            "half_scale": cv2.resize(normalized, None, fx=.5, fy=.5,
                interpolation=cv2.INTER_AREA),
        }

    def get_binary_strokes(self, threshold_val: int = 210) -> np.ndarray:
        """Get binary mask of thin strokes and borders (foreground=255, background=0)."""
        if self.is_dark_background:
            # Light strokes on dark canvas
            _, binary = cv2.threshold(self.enhanced_gray, 80, 255, cv2.THRESH_BINARY)
        else:
            # Dark strokes on light canvas
            _, binary = cv2.threshold(self.gray, threshold_val, 255, cv2.THRESH_BINARY_INV)
        return binary

    def get_color_saturation_mask(self, min_saturation: int = 35, min_val: int = 40) -> np.ndarray:
        """Mask highlighting colored components distinctly from neutral white/gray canvas."""
        s = self.hsv[:, :, 1]
        v = self.hsv[:, :, 2]
        colored = (s >= min_saturation) & (v >= min_val) & (v <= 250)
        mask = np.zeros((self.height, self.width), dtype=np.uint8)
        mask[colored] = 255
        return mask

