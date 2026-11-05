"""SQLite database management for DiagramFlow users, audits, and chat history."""

from __future__ import annotations

import os
import sqlite3
import hashlib
import hmac
import secrets
import json
from datetime import datetime
from typing import Optional, List, Dict, Any
from pathlib import Path
from backend import settings

DB_PATH = Path(os.environ.get("DIAGRAMFLOW_DB_PATH", str(Path(__file__).resolve().parent.parent / "data" / "diagramflow.db")))
os.makedirs(DB_PATH.parent, exist_ok=True)


def get_db_connection() -> sqlite3.Connection:
    """Connect to SQLite database with row factory enabled."""
    conn = sqlite3.connect(str(DB_PATH), timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
    except Exception:
        pass
    return conn


DEFAULT_ROUNDS = 50000 if os.environ.get("DIAGRAMFLOW_ENV") != "test" else 1000
PBKDF2_ROUNDS = int(os.environ.get("DIAGRAMFLOW_PBKDF2_ROUNDS", str(DEFAULT_ROUNDS)))


def hash_password(password: str) -> str:
    """Store a separate random salt per password, using PBKDF2-SHA256."""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PBKDF2_ROUNDS).hex()
    return f"pbkdf2_sha256${PBKDF2_ROUNDS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    if stored.startswith("pbkdf2_sha256$"):
        try:
            _, rounds, salt, expected = stored.split("$")
            actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(rounds)).hex()
            return hmac.compare_digest(actual, expected)
        except (ValueError, TypeError):
            return False
    # Existing installations are migrated after a successful login.
    legacy = hashlib.sha256((password + "diagramflow_secure_salt_2026").encode()).hexdigest()
    return hmac.compare_digest(legacy, stored)


def init_db():
    """Create database tables and seed default admin account."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Users Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 2. Audits Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            diagram_name TEXT NOT NULL,
            image_path TEXT,
            overlay_path TEXT,
            requirements_text TEXT,
            architecture_graph TEXT,
            visual_evidence_graph TEXT,
            parsed_requirements TEXT,
            discrepancy_report TEXT,
            synthesized_architecture TEXT,
            mermaid_code TEXT,
            transparency_traces TEXT,
            alignment_score REAL,
            executive_verdict TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)

    # 3. Chat History Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            audit_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (audit_id) REFERENCES audits (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)

    # Additive migration: preserve evidence and completion state across reloads.
    columns = {row[1] for row in cursor.execute("PRAGMA table_info(audits)")}
    for column in ("knowledge_chunks", "processing_stats", "warnings", "status"):
        if column not in columns:
            cursor.execute(f"ALTER TABLE audits ADD COLUMN {column} TEXT")

    # Administrator creation must be explicit; never ship a shared password.
    cursor.execute("SELECT id FROM users WHERE username = 'admin'")
    if not cursor.fetchone() and os.environ.get("DIAGRAMFLOW_ADMIN_PASSWORD"):
        admin_pass = hash_password(os.environ["DIAGRAMFLOW_ADMIN_PASSWORD"])
        cursor.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            ("admin", admin_pass, "admin")
        )
    if os.environ.get("DIAGRAMFLOW_ENV") == "production":
        admin = cursor.execute("SELECT password_hash FROM users WHERE username='admin'").fetchone()
        if admin and verify_password("admin123", admin[0]):
            conn.close()
            raise RuntimeError("Replace the legacy admin123 administrator password before production deployment.")

    conn.commit()
    conn.close()


init_db()

