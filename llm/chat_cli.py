"""Interactive Chatbot CLI for grounded architecture queries."""

from __future__ import annotations

import os
import sys
import json
import argparse
from pathlib import Path

# Add workspace root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from llm.rag.chatbot import ArchitectureChatbot
from llm.graph.workflow import build_architecture_graph


def launch_chat_session(architecture_json: str, requirements_file: str):
    """Index architecture context and start interactive chatbot session."""
    print("=" * 70)
    print("          DIAGRAMFLOW GROUNDED ARCHITECTURE CHATBOT")
    print("=" * 70)
    print("Initializing knowledge graph from CV visual extractions and requirements...")

    with open(architecture_json, "r", encoding="utf-8") as f:
        arch_graph = json.load(f)

    evidence_json = architecture_json.replace("_architecture.json", "_evidence.json")
    evidence_graph = {}
    if os.path.exists(evidence_json):
        with open(evidence_json, "r", encoding="utf-8") as f:
            evidence_graph = json.load(f)

    with open(requirements_file, "r", encoding="utf-8") as f:
        req_text = f.read()

    diag_stem = Path(architecture_json).stem.replace("_architecture", "")

    # Run LangGraph indexing
    app = build_architecture_graph()
    state = app.invoke({
        "diagram_name": diag_stem,
        "architecture_graph": arch_graph,
        "visual_evidence_graph": evidence_graph,
        "requirements_text": req_text
    })

    knowledge_chunks = state.get("knowledge_chunks", [])
    print(f"Loaded {len(knowledge_chunks)} verified knowledge chunks.")
    print("Strict Anti-Hallucination Guardrails: ACTIVE")
    print("Type your questions below. Type 'exit', 'quit', or 'q' to stop.")
    print("-" * 70)

    bot = ArchitectureChatbot(knowledge_chunks, system_name=diag_stem)

    while True:
        try:
            query = input("\nYou > ").strip()
            if not query:
                continue
            if query.lower() in ("exit", "quit", "q"):
                print("Ending architecture chat session. Goodbye!")
                break

            response = bot.ask(query)
            print(f"\nAssistant >\n{response}")

        except (KeyboardInterrupt, EOFError):
            print("\nSession interrupted. Exiting.")
            break


def main():
    parser = argparse.ArgumentParser(description="DiagramFlow Grounded Architecture Chatbot")
    parser.add_argument("-a", "--architecture", required=True, help="Path to FOCV architecture JSON")
    parser.add_argument("-r", "--requirements", required=True, help="Path to requirements text or markdown file")

    args = parser.parse_args()
    launch_chat_session(args.architecture, args.requirements)


if __name__ == "__main__":
    main()

