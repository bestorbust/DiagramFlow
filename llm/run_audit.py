"""CLI Tool to run full LangGraph architecture discrepancy audit and synthesis."""

from __future__ import annotations

import os
import sys
import json
import argparse
from pathlib import Path

# Add workspace to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from llm.graph.workflow import build_architecture_graph


def run_architecture_audit(
    architecture_json_path: str,
    requirements_text_path: str,
    evidence_json_path: str = None,
    output_dir: str = "llm/audit_reports"
):
    """Execute LangGraph workflow against visual extraction and requirements."""
    print("=" * 70)
    print("      DIAGRAMFLOW ARCHITECTURE DISCREPANCY & SYNTHESIS ENGINE")
    print("=" * 70)

    # 1. Load Architecture Graph
    if not os.path.exists(architecture_json_path):
        raise FileNotFoundError(f"Architecture JSON not found at: {architecture_json_path}")
    with open(architecture_json_path, "r", encoding="utf-8") as f:
        arch_graph = json.load(f)

    # 2. Load Visual Evidence Graph (if provided)
    evidence_graph = {}
    if evidence_json_path and os.path.exists(evidence_json_path):
        with open(evidence_json_path, "r", encoding="utf-8") as f:
            evidence_graph = json.load(f)
    else:
        # Try inferring evidence path from arch path
        inferred = architecture_json_path.replace("_architecture.json", "_evidence.json")
        if os.path.exists(inferred):
            with open(inferred, "r", encoding="utf-8") as f:
                evidence_graph = json.load(f)

    # 3. Load Requirements Text
    if not os.path.exists(requirements_text_path):
        raise FileNotFoundError(f"Requirements file not found at: {requirements_text_path}")
    with open(requirements_text_path, "r", encoding="utf-8") as f:
        requirements_text = f.read()

    diag_stem = Path(architecture_json_path).stem.replace("_architecture", "")
    os.makedirs(output_dir, exist_ok=True)

    initial_state = {
        "diagram_name": diag_stem,
        "architecture_graph": arch_graph,
        "visual_evidence_graph": evidence_graph,
        "requirements_text": requirements_text,
    }

    # 4. Compile and Run LangGraph
    print("\n[1/4] Compiling and invoking LangGraph workflow...")
    app = build_architecture_graph()
    final_state = app.invoke(initial_state)

    discrepancy_report = final_state.get("discrepancy_report", {})
    synthesized = final_state.get("synthesized_architecture", {})
    synth_inner = synthesized.get("synthesized_architecture", {})
    mermaid_code = synth_inner.get("mermaid_code", "")

    # 5. Save Artifacts
    audit_json_path = os.path.join(output_dir, f"{diag_stem}_discrepancy_audit.json")
    with open(audit_json_path, "w", encoding="utf-8") as f:
        json.dump(discrepancy_report, f, indent=2)

    synth_json_path = os.path.join(output_dir, f"{diag_stem}_synthesized.json")
    with open(synth_json_path, "w", encoding="utf-8") as f:
        json.dump(synthesized, f, indent=2)

    if mermaid_code:
        mmd_path = os.path.join(output_dir, f"{diag_stem}_synthesized.mmd")
        with open(mmd_path, "w", encoding="utf-8") as f:
            f.write(mermaid_code)

    # Generate Markdown Summary Report
    md_path = os.path.join(output_dir, f"{diag_stem}_audit_report.md")
    summary = discrepancy_report.get("audit_summary", {})
    discrepancies = discrepancy_report.get("discrepancies", [])

    with open(md_path, "w", encoding="utf-8") as f:
        f.write(f"# Architecture Discrepancy & Drift Audit: {diag_stem}\n\n")
        f.write(f"- **Executive Verdict:** {summary.get('executive_verdict', 'Unknown')}\n")
        f.write(f"- **Alignment Score:** {summary.get('alignment_score_percentage', 0.0)}%\n")
        f.write(f"- **Total Discrepancies:** {summary.get('total_discrepancies', len(discrepancies))}\n")
        f.write(f"- **Critical Severity:** {summary.get('critical_severity_count', 0)}\n\n")

        f.write("## Identified Architectural Discrepancies\n\n")
        for d in discrepancies:
            f.write(f"### [{d.get('severity', 'INFO')}] {d.get('id', '')}: {d.get('title', '')}\n")
            f.write(f"- **Category:** `{d.get('category')}`\n")
            f.write(f"- **Visual Diagram Evidence:** {d.get('visual_evidence')}\n")
            f.write(f"- **Requirements Specification:** {d.get('requirements_clause')}\n")
            f.write(f"- **Recommendation:** {d.get('recommendation')}\n\n")

        if mermaid_code:
            f.write("## Corrected Target Architecture (Mermaid.js)\n\n")
            f.write("```mermaid\n")
            f.write(mermaid_code.strip() + "\n")
            f.write("```\n\n")

    print("\n" + "=" * 70)
    print("                     AUDIT EXECUTION COMPLETE")
    print("=" * 70)
    print(f"Alignment Score:      {summary.get('alignment_score_percentage', 0.0)}%")
    print(f"Executive Verdict:    {summary.get('executive_verdict', 'Unknown')}")
    print(f"Total Discrepancies:  {len(discrepancies)}")
    print(f"Saved Audit Report:   {md_path}")
    print(f"Saved Audit JSON:     {audit_json_path}")
    print(f"Saved Target Diagram: {output_dir}/{diag_stem}_synthesized.mmd")
    print("=" * 70)

    return final_state


def main():
    parser = argparse.ArgumentParser(description="DiagramFlow Architecture LLM Discrepancy & Synthesis")
    parser.add_argument("-a", "--architecture", required=True, help="Path to FOCV architecture JSON")
    parser.add_argument("-r", "--requirements", required=True, help="Path to requirements text or markdown file")
    parser.add_argument("-e", "--evidence", default=None, help="Path to visual evidence JSON")
    parser.add_argument("-o", "--output", default="llm/audit_reports", help="Output directory")

    args = parser.parse_args()
    run_architecture_audit(args.architecture, args.requirements, args.evidence, args.output)


if __name__ == "__main__":
    main()

