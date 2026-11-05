"""LangGraph StateGraph assembly for architecture discrepancy audit and synthesis."""

from __future__ import annotations

from langgraph.graph import StateGraph, START, END
from .state import ArchitectureAuditState
from .nodes import (
    parse_requirements_node,
    diff_audit_node,
    synthesize_architecture_node,
    index_knowledge_node
)


def build_architecture_graph():
    """Construct and compile the LangGraph workflow."""
    workflow = StateGraph(ArchitectureAuditState)

    # 1. Register Nodes
    workflow.add_node("parse_requirements", parse_requirements_node)
    workflow.add_node("diff_audit", diff_audit_node)
    workflow.add_node("synthesize_architecture", synthesize_architecture_node)
    workflow.add_node("index_knowledge", index_knowledge_node)

    # 2. Define Sequential Flow
    workflow.add_edge(START, "parse_requirements")
    workflow.add_edge("parse_requirements", "diff_audit")
    workflow.add_edge("diff_audit", "synthesize_architecture")
    workflow.add_edge("synthesize_architecture", "index_knowledge")
    workflow.add_edge("index_knowledge", END)

    return workflow.compile()

