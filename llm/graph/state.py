"""State definition for LangGraph architecture audit and synthesis pipeline."""

from __future__ import annotations

from typing import TypedDict, List, Dict, Any, Optional


class ArchitectureAuditState(TypedDict, total=False):
    """LangGraph shared state carrying architectural graphs, requirements, and findings."""
    diagram_name: str
    architecture_graph: Dict[str, Any]
    visual_evidence_graph: Dict[str, Any]
    requirements_text: str
    parsed_requirements: Dict[str, Any]
    discrepancy_report: Dict[str, Any]
    synthesized_architecture: Dict[str, Any]
    knowledge_chunks: List[Dict[str, Any]]
    chat_messages: List[Dict[str, str]]
    error: Optional[str]

