"""Multi-pass OCR engine with targeted ROI processing and text cleanup."""

from __future__ import annotations

import re
import cv2
import numpy as np
import pytesseract
from typing import List, Dict, Any, Optional

from cv.src.config import find_tesseract_cmd


class OCREngine:
    """Robust OCR engine utilizing Tesseract with targeted multi-scale passes."""

    def __init__(self, tesseract_cmd: Optional[str] = None):
        cmd = tesseract_cmd or find_tesseract_cmd()
        if cmd:
            pytesseract.pytesseract.tesseract_cmd = cmd
        self.cmd = cmd

    def is_available(self) -> bool:
        """Check if Tesseract is configured and responsive."""
        if not self.cmd:
            return False
        try:
            ver = pytesseract.get_tesseract_version()
            return ver is not None
        except Exception:
            return False

    def clean_text(self, text: str) -> str:
        """Clean OCR output string removing artifacts while preserving architectural terms."""
        if not text:
            return ""
        # Remove replacement / corrupt characters
        text = text.replace("\ufffd", "")
        text = text.strip("\u2018\u2019\u201c\u201d")
        # Replace non-breaking spaces and irregular whitespace
        t = re.sub(r"[\r\n\t]+", " ", text)
        t = re.sub(r"\s{2,}", " ", t).strip()
        # Remove stray punctuation commonly outputted on box borders
        t = re.sub(r"^[\-_=~`|\.\,\:\;\'\"<>\[\]\(\)\{\}\\]+|[\-_=~`|\.\,\:\;\'\"<>\[\]\(\)\{\}\\]+$", "", t).strip()
        # Clean cylinder cap artifacts like leading '2 ', 'ee ', or trailing ' eee'
        t = re.sub(r"^[2eE]\s+(?=[A-Za-z])", "", t).strip()
        t = re.sub(r"^ee\s+", "", t, flags=re.IGNORECASE).strip()
        t = re.sub(r"\s+eee$", "", t, flags=re.IGNORECASE).strip()
        # Separate camelCase like 'PeerA' -> 'Peer A'
        t = re.sub(r"([a-z])([A-Z])", r"\1 \2", t)

        # Lexicon normalization for recognized architectural terms
        compact_key = re.sub(r"[^a-z0-9]", "", t.lower())
        ARCH_TERMS = {
            "postgresol": "PostgreSQL", "postgreso": "PostgreSQL", "postgres": "PostgreSQL",
            "postgresql": "PostgreSQL", "mongodb": "MongoDB", "dynamodb": "DynamoDB",
            "rabbitmq": "RabbitMQ", "apachekafka": "Apache Kafka", "kafka": "Kafka",
            "redis": "Redis", "kubernetes": "Kubernetes", "nginx": "Nginx",
            "apigateway": "API Gateway", "loadbalancer": "Load Balancer",
            "microservice": "Microservice", "elasticsearch": "Elasticsearch",
            "frontend": "Frontend", "backend": "Backend"
        }
        if compact_key in ARCH_TERMS:
            return ARCH_TERMS[compact_key]
        return t

    def extract_words_global(self, image_bgr: np.ndarray, _fallback=False) -> List[Dict[str, Any]]:
        """Perform a global OCR pass extracting all words with bounding boxes and confidence."""
        if not self.is_available():
            return []

        # Multi-pass global OCR: Combine PSM 11 (sparse text) and PSM 3 (fully automatic segmentation)
        # to ensure text tokens on both sparse annotations and structured component layouts are discovered.
        datasets = []
        for psm in (11, 3):
            try:
                d = pytesseract.image_to_data(
                    image_bgr,
                    config=f"--psm {psm}",
                    output_type=pytesseract.Output.DICT,
                    timeout=25
                )
                datasets.append((d, 1.0))
            except Exception:
                continue

        heights = [d['height'][i] for d, _ in datasets for i, t in enumerate(d.get('text', []))
                   if t.strip() and float(d['conf'][i]) >= 60]
        # Small text needs an additional scaled pass even when the first pass
        # returned some words. Preserve pixel coordinates in the source image.
        if not _fallback and (not heights or np.median(heights) < 17):
            from cv.src.preprocessing import PreprocessedImage
            view = PreprocessedImage(image_bgr).local_ocr_image()
            scale = min(2.5, 4200 / max(image_bgr.shape[:2]))
            if scale > 1.1:
                enlarged = cv2.resize(view, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
                try:
                    d = pytesseract.image_to_data(enlarged, config='--psm 11',
                        output_type=pytesseract.Output.DICT, timeout=30)
                    datasets.append((d, scale))
                except (RuntimeError, pytesseract.TesseractError):
                    pass

        raw_words: List[Dict[str, Any]] = []
        for data, scale in datasets:
            n_boxes = len(data.get("text", []))
            for i in range(n_boxes):
                raw_text = data["text"][i]
                conf = float(data["conf"][i])
                if conf < 30:
                    continue
                cleaned = self.clean_text(raw_text)
                if not cleaned or len(cleaned) == 0:
                    continue

                x = int(round(data["left"][i] / scale))
                y = int(round(data["top"][i] / scale))
                w = int(round(data["width"][i] / scale))
                h = int(round(data["height"][i] / scale))

                # Sparse OCR sometimes interprets a whole crossing-line network as
                # two huge letters. Such tokens must never erase the connections.
                if h > max(40, image_bgr.shape[0] * .08):
                    continue

                # Filter tiny single-char noise
                if len(cleaned) == 1 and not cleaned.isalnum():
                    continue

                # Filter corrupt or hallucinated line noise tokens
                if "\ufffd" in raw_text:
                    continue
                if conf < 45 and len(cleaned) <= 3:
                    continue
                char_w = w / max(1, len(cleaned))
                if conf < 50 and char_w > 1.3 * h:
                    continue

                raw_words.append({
                    "text": cleaned,
                    "bbox": [x, y, w, h],
                    "center": [x + w // 2, y + h // 2],
                    "ocr_scale": scale,
                    "confidence": round(conf / 100.0, 3)
                })

        # Deduplicate overlapping tokens from multiple passes, keeping highest confidence
        def _token_iou(b1, b2):
            x1 = max(b1[0], b2[0])
            y1 = max(b1[1], b2[1])
            x2 = min(b1[0] + b1[2], b2[0] + b2[2])
            y2 = min(b1[1] + b1[3], b2[1] + b2[3])
            inter = max(0, x2 - x1) * max(0, y2 - y1)
            u = b1[2] * b1[3] + b2[2] * b2[3] - inter
            return inter / float(u) if u > 0 else 0.0

        words: List[Dict[str, Any]] = []
        for w in sorted(raw_words, key=lambda item: -item["confidence"]):
            def duplicate(kept):
                if _token_iou(w['bbox'],kept['bbox'])>.45:
                    return True
                a,b,c,d=w['bbox'];x,y,ww,hh=kept['bbox']
                overlap=max(0,min(a+c,x+ww)-max(a,x))*max(0,min(b+d,y+hh)-max(b,y))
                return w['text'].casefold()==kept['text'].casefold() and overlap/max(1,min(c*d,ww*hh))>.8
            if not any(duplicate(kept) for kept in words):
                w["id"] = f"word_{len(words)}"
                words.append(w)

        if not words and not _fallback:
            gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
            _, binary = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY)
            enlarged = cv2.resize(binary, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
            words = self.extract_words_global(cv2.cvtColor(enlarged, cv2.COLOR_GRAY2BGR), _fallback=True)
            for word in words:
                word["bbox"] = [int(round(v/2)) for v in word["bbox"]]
                x, y, w, h = word["bbox"]
                word["center"] = [x+w//2, y+h//2]
        return words

    def extract_text_from_roi(self, roi_bgr: np.ndarray, min_dim: int = 120, is_cylinder: bool = False) -> Dict[str, Any]:
        """Perform targeted multi-scale, multi-polarity OCR on a component ROI."""
        if roi_bgr is None or roi_bgr.size == 0 or not self.is_available():
            return {"text": "", "confidence": 0.0}

        h, w = roi_bgr.shape[:2]
        if w < 10 or h < 10:
            return {"text": "", "confidence": 0.0}

        # Cylinder icons have an elliptical cap at top ~20% and curved bottom.
        # Inset top by ~18% and bottom by ~8% to avoid OCR reading ellipse as '2' or 'ee'.
        if is_cylinder:
            cyl_top = int(h * 0.18)
            cyl_bot = max(1, int(h * 0.08))
            if h - cyl_top - cyl_bot > 15:
                roi_bgr = roi_bgr[cyl_top:h - cyl_bot, :]
                h, w = roi_bgr.shape[:2]

        # Rescale if ROI is small to improve character clarity
        scale_factor = 1.0
        # Trim 7% interior margin to strip outer box/cylinder borders that cause OCR hallucinations
        # Percentage-only cropping cuts letters when labels nearly fill a box.
        # A capped stroke inset removes the border without removing the label.
        margin_y = min(4, max(2, int(h * 0.04)))
        margin_x = min(4, max(2, int(w * 0.04)))
        if h - 2 * margin_y > 15 and w - 2 * margin_x > 15:
            cropped_roi = roi_bgr[margin_y:h-margin_y, margin_x:w-margin_x]
        else:
            cropped_roi = roi_bgr

        ch, cw = cropped_roi.shape[:2]
        scale_factor = 1.0
        if cw < min_dim or ch < min_dim:
            scale_factor = max(1.5, min(3.0, float(min_dim) / max(cw, ch, 1)))

        if scale_factor > 1.05:
            processed = cv2.resize(
                cropped_roi,
                (0, 0),
                fx=scale_factor,
                fy=scale_factor,
                interpolation=cv2.INTER_CUBIC
            )
        else:
            processed = cropped_roi.copy()

        processed_gray = cv2.cvtColor(processed, cv2.COLOR_BGR2GRAY)
        # Apply CLAHE to pop text out from colored/gradient fills
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced_gray = clahe.apply(processed_gray)
        _, text_binary = cv2.threshold(enhanced_gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        pad = 20
        padded_normal = cv2.copyMakeBorder(
            text_binary, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=255
        )

        candidates = []
        # Multi-strategy evaluation: PSM 7 (single text line), PSM 6 (block), PSM 11 (sparse)
        for psm in (7, 6, 11):
            try:
                data = pytesseract.image_to_data(
                    padded_normal,
                    config=f"--psm {psm}",
                    output_type=pytesseract.Output.DICT,
                    timeout=20
                )
                words = []
                confs = []
                for i, t in enumerate(data.get("text", [])):
                    c = float(data["conf"][i])
                    cleaned = self.clean_text(t)
                    if cleaned and c > 25 and any(ch.isalnum() for ch in cleaned):
                        words.append(cleaned)
                        confs.append(c)
                if words:
                    full_label = " ".join(words)
                    avg_conf = float(np.mean(confs)) if confs else 0.0
                    candidates.append((full_label, avg_conf))
                    if avg_conf >= 90:
                        break
            except Exception:
                continue

        # Fallback to inverted polarity ONLY if normal polarity found nothing
        if not candidates or max(c[1] for c in candidates) < 85 or np.median(processed_gray) < 150:
            padded_inverted = cv2.copyMakeBorder(
                255 - processed_gray, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=255
            )
            for psm in (11, 6):
                try:
                    data = pytesseract.image_to_data(
                        padded_inverted,
                        config=f"--psm {psm}",
                        output_type=pytesseract.Output.DICT,
                        timeout=20
                    )
                    words = []
                    confs = []
                    for i, t in enumerate(data.get("text", [])):
                        c = float(data["conf"][i])
                        cleaned = self.clean_text(t)
                        if cleaned and c > 35 and len(cleaned) > 1:
                            words.append(cleaned)
                            confs.append(c)
                    if words:
                        full_label = " ".join(words)
                        avg_conf = float(np.mean(confs)) if confs else 0.0
                        candidates.append((full_label, avg_conf))
                except Exception:
                    continue

        if not candidates:
            return {"text": "", "confidence": 0.0}

        def candidate_score(c):
            text, conf = c
            alnum_count = sum(1 for ch in text if ch.isalnum())
            return (conf / 100.0) * min(alnum_count, 40)

        best_text, best_conf = max(candidates, key=candidate_score)
        # Strip trailing/leading non-alpha artifacts like << or >>
        best_text = re.sub(r"^[<\(\[\{]+|[>\)\]\}]+$", "", best_text).strip()
        return {
            "text": best_text,
            "confidence": round(best_conf / 100.0, 3)
        }
