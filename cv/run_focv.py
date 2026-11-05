"""Standalone CLI runner for FOCV (Fully Optical Computer Vision) Pipeline."""

from __future__ import annotations

import argparse
import os
import sys
import glob
import time
from pathlib import Path

# Add project root to sys.path so cv.src imports work seamlessly
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
CV_DIR = Path(__file__).resolve().parent
if str(CV_DIR) not in sys.path:
    sys.path.insert(0, str(CV_DIR))

from cv.src.pipeline import FOCVPipeline


def main():
    parser = argparse.ArgumentParser(
        description="DiagramFlow FOCV: Autonomous Architecture Diagram Vision Pipeline"
    )
    parser.add_argument(
        "--input", "-i",
        type=str,
        required=True,
        help="Path to an architecture diagram image file (PNG, JPEG, WebP) or directory of diagrams"
    )
    parser.add_argument(
        "--output-dir", "-o",
        type=str,
        default="outputs",
        help="Directory where output JSON and visual overlay files will be saved (default: outputs/)"
    )
    parser.add_argument(
        "--batch", "-b",
        action="store_true",
        help="Process all diagrams in input directory"
    )

    args = parser.parse_args()
    pipeline = FOCVPipeline()

    if args.batch or os.path.isdir(args.input):
        search_dir = args.input if os.path.isdir(args.input) else os.path.dirname(args.input)
        patterns = [os.path.join(search_dir, "*.png"), os.path.join(search_dir, "*.jpg"), os.path.join(search_dir, "*.jpeg"), os.path.join(search_dir, "*.webp")]
        images = []
        for p in patterns:
            images.extend(glob.glob(p))
        images = sorted(images)
        if not images:
            print(f"No image files (PNG/JPG/WebP) found in: {search_dir}")
            return

        print(f"Found {len(images)} diagrams to process in batch mode.")
        os.makedirs(args.output_dir, exist_ok=True)

        start_all = time.time()
        for idx, img_path in enumerate(images, 1):
            base_name = os.path.splitext(os.path.basename(img_path))[0]
            t0 = time.time()
            try:
                res = pipeline.process_image(img_path)
                saved = res.save(args.output_dir, base_name)
                dt = time.time() - t0
                stats = res.processing_stats
                print(
                    f"[{idx:2d}/{len(images)}] {base_name:20s} | "
                    f"Nodes: {stats['num_components']:2d} | "
                    f"Edges: {stats['num_relationships']:2d} | "
                    f"Groups: {stats['num_groups']:2d} | {dt:.2f}s"
                )
            except Exception as e:
                print(f"[{idx:2d}/{len(images)}] {base_name:20s} | ERROR: {e}")
        total_dt = time.time() - start_all
        print(f"Completed batch processing in {total_dt:.2f}s. Artifacts saved in '{args.output_dir}'.")
    else:
        if not os.path.exists(args.input):
            print(f"Error: Diagram image file not found at: {args.input}")
            sys.exit(1)

        base_name = os.path.splitext(os.path.basename(args.input))[0]
        print(f"Processing diagram: {args.input}...")
        t0 = time.time()
        res = pipeline.process_image(args.input)
        saved = res.save(args.output_dir, base_name)
        dt = time.time() - t0
        stats = res.processing_stats
        print(f"Completed in {dt:.2f}s.")
        print(f"Components found:      {stats['num_components']}")
        print(f"Groups found:          {stats['num_groups']}")
        print(f"Relationships found:   {stats['num_relationships']}")
        print(f"Architecture JSON:     {saved['architecture_json']}")
        print(f"Visual Evidence JSON:  {saved['evidence_json']}")
        print(f"Visual Overlay:        {saved['overlay_image']}")


if __name__ == "__main__":
    main()
