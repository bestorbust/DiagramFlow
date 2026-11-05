"""FastAPI Application connecting FOCV, LLM LangGraph, User/Admin Auth, and Grounded RAG."""

from __future__ import annotations

import os
import sys
import json
import shutil
import time
import uuid
import asyncio
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Literal

from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
from PIL import Image, UnidentifiedImageError
from io import BytesIO

# Add workspace paths
WORKSPACE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(WORKSPACE_DIR))
sys.path.insert(0, str(WORKSPACE_DIR / "cv"))

from backend.database import get_db_connection, hash_password, verify_password
from backend.auth import create_access_token, get_current_user, get_current_admin, SECRET_KEY, ALGORITHM
import jwt
from datetime import datetime, timedelta, timezone
from backend.pipeline_runner import runner, STATIC_DIR
from backend.document_parser import parse_any_document
from llm.rag.chatbot import ArchitectureChatbot

app = FastAPI(title="DiagramFlow FOCV & LLM API", version="2.0.0")

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("DIAGRAMFLOW_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static directory for uploaded images and generated overlays
def asset_url(path):
    if not path or not path.startswith('/static/'):
        return path
    relative = path[len('/static/'):].split('?')[0]
    token = jwt.encode({'asset': relative, 'exp': datetime.now(timezone.utc) + timedelta(hours=24)}, SECRET_KEY, algorithm=ALGORITHM)
    return f'/static/{relative}?token={token}'


@app.get('/static/{asset_path:path}')
def private_asset(asset_path: str, token: str = ''):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={'require': ['exp']})
        if payload.get('asset') != asset_path:
            raise HTTPException(403, 'Invalid artifact link.')
    except jwt.PyJWTError as exc:
        raise HTTPException(403, 'Artifact link expired. Reopen the audit.') from exc
    resolved = (STATIC_DIR / asset_path).resolve()
    if not resolved.is_relative_to(STATIC_DIR.resolve()) or not resolved.is_file():
        raise HTTPException(404, 'Artifact not found.')
    return FileResponse(resolved, headers={'Cache-Control': 'private, no-store'})


@app.get('/api/health')
def health():
    from cv.src.config import find_tesseract_cmd
    from llm.providers.llm_factory import _factory, SUPPORTED_OPENROUTER_MODELS
    providers = [name for name, key in [('groq', 'GROQ_API_KEY'), ('openrouter', 'OPENROUTER_API_KEY'), ('gemini', 'GEMINI_API_KEY')] if os.environ.get(key)]
    ocr = bool(find_tesseract_cmd())
    built = (WORKSPACE_DIR / 'frontend' / 'dist' / 'index.html').exists()
    return {
        'status': 'ready' if ocr and providers and built else 'not_ready',
        'ocr_available': ocr,
        'configured_providers': providers,
        'active_provider': _factory.current_provider if providers else None,
        'openrouter_models': SUPPORTED_OPENROUTER_MODELS,
        'frontend_built': built,
        'note': 'Readiness checks configuration; it does not verify provider quota or extraction accuracy.'
    }

# Mount diagrams directory for sample access
DIAGRAMS_DIR = WORKSPACE_DIR / "data" / "diagrams"
if not DIAGRAMS_DIR.exists():
    DIAGRAMS_DIR = WORKSPACE_DIR / "cv" / "data" / "diagrams"
if DIAGRAMS_DIR.exists():
    app.mount("/diagram_samples", StaticFiles(directory=str(DIAGRAMS_DIR)), name="diagram_samples")

# Mount prototype demo
PROTOTYPE_DIR = WORKSPACE_DIR / "prototype"
if PROTOTYPE_DIR.exists():
    @app.get("/demo")
    def redirect_demo():
        return RedirectResponse(url="/demo/")
    app.mount("/demo", StaticFiles(directory=str(PROTOTYPE_DIR), html=True), name="demo")




# =============================================================================
# AUTH SCHEMAS & ENDPOINTS
# =============================================================================
class UserRegisterRequest(BaseModel):
    username: str
    password: str


class ChatMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10000)


class DiscrepancyReviewRequest(BaseModel):
    decision: Literal["accepted", "rejected", "flagged", "pending"]
    note: Optional[str] = ""


MAX_UPLOAD_BYTES = 20 * 1024 * 1024
class LoopBoundSemaphore:
    def __init__(self, value: int = 8):
        self.value = value
        self._sems: Dict[Any, asyncio.Semaphore] = {}

    def _get_sem(self) -> asyncio.Semaphore:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop not in self._sems:
            self._sems[loop] = asyncio.Semaphore(self.value)
        return self._sems[loop]

    async def __aenter__(self):
        return await self._get_sem().__aenter__()

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return await self._get_sem().__aexit__(exc_type, exc_val, exc_tb)


audit_slots = LoopBoundSemaphore(8)


async def read_upload(upload):
    content = await upload.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Upload exceeds the 20 MB limit.")
    if not content:
        raise HTTPException(422, "The uploaded file is empty.")
    return content


def validate_image(content):
    try:
        with Image.open(BytesIO(content)) as img:
            if img.format not in {"PNG", "JPEG", "WEBP"}:
                raise ValueError("Use PNG, JPEG or WebP images.")
            if img.width * img.height > 25_000_000:
                raise ValueError("Image exceeds 25 million pixels.")
            img.verify()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise HTTPException(422, "Invalid diagram image: " + str(exc)) from exc


@app.post("/api/auth/register")
def register_user(req: UserRegisterRequest):
    """User self-registration."""
    username = req.username.strip()
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters.")
    if len(req.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters.")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Username is already taken.")

    pass_hash = hash_password(req.password)
    cursor.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')",
        (username, pass_hash)
    )
    conn.commit()
    user_id = cursor.lastrowid
    conn.close()

    token = create_access_token({"sub": username, "role": "user"})
    return {"token": token, "username": username, "role": "user", "id": user_id}


@app.post("/api/auth/login")
async def login(request: Request):
    """Authenticate username & password (supports both JSON and Form urlencoded)."""
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        data = await request.json()
        username = str(data.get("username", "")).strip()
        password = str(data.get("password", ""))
    else:
        form = await request.form()
        username = str(form.get("username", "")).strip()
        password = str(form.get("password", ""))

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, password_hash, role FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    conn.close()

    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user["password_hash"].startswith("pbkdf2_sha256$"):
        with get_db_connection() as upgrade:
            upgrade.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(password), user["id"]))
        upgrade.close()
    token = create_access_token({"sub": user["username"], "role": user["role"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user["username"],
        "role": user["role"],
        "id": user["id"]
    }


@app.get("/api/auth/me")
def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Retrieve logged in user info."""
    return current_user


# =============================================================================
# DIAGRAMS & SAMPLE REQUIREMENTS ENDPOINTS
# =============================================================================
@app.get("/api/diagrams/samples")
def list_sample_diagrams():
    """List benchmark diagrams available in data/diagrams/."""
    samples = []
    if DIAGRAMS_DIR.exists():
        for f in sorted(os.listdir(DIAGRAMS_DIR)):
            if f.endswith(".png"):
                samples.append({
                    "filename": f,
                    "url": f"/diagram_samples/{f}",
                    "name": Path(f).stem
                })
    return {"samples": samples}


@app.get("/api/requirements/sample")
def get_sample_requirements():
    """Return default sample requirements document for testing."""
    sample_path = WORKSPACE_DIR / "llm" / "sample_requirements" / "sample_req_diagram6.md"
    if sample_path.exists():
        with open(sample_path, "r", encoding="utf-8") as f:
            return {"content": f.read()}
    return {"content": "# Architecture Requirements\n\n1. Web Client must communicate with Server over HTTPS.\n2. Server must cache queries in Redis and persist to PostgreSQL Primary."}


@app.post("/api/requirements/parse-document")
async def parse_requirements_document(file: UploadFile = File(...)):
    """Extract and analyze text from any uploaded requirements document (PDF, Word, Markdown, Text, JSON, YAML, etc.)."""
    try:
        file_bytes = await read_upload(file)
        filename = file.filename or "uploaded_document.txt"
        result = await run_in_threadpool(parse_any_document, file_bytes, filename)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse document: {str(e)}")


# =============================================================================
# AUDIT EXECUTION & PERSISTENCE
# =============================================================================
@app.post('/api/diagrams/extract')
async def extract_diagram(request: Request, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Inspect diagram pixels independently of requirements or LLM availability."""
    from cv.src.pipeline import FOCVPipeline
    form = await request.form()
    upload = form.get('image_file')
    sample = str(form.get('sample_diagram') or '')
    if upload and hasattr(upload, 'filename') and upload.filename:
        content = await read_upload(upload)
        validate_image(content)
        suffix = Path(upload.filename).suffix.lower()
        if suffix not in {'.png', '.jpg', '.jpeg', '.webp'}:
            raise HTTPException(422, 'Use PNG, JPEG or WebP images.')
        filename = uuid.uuid4().hex + suffix
        path = STATIC_DIR / 'uploads' / filename
        path.write_bytes(content)
        name = Path(upload.filename.replace('\\', '/')).stem[:200]
        image_path = '/static/uploads/' + filename
    elif sample:
        filename = sample if sample.endswith('.png') else sample + '.png'
        path = (DIAGRAMS_DIR / filename).resolve()
        if path.parent != DIAGRAMS_DIR.resolve():
            raise HTTPException(400, 'Invalid sample diagram name.')
        if not path.is_file():
            raise HTTPException(404, 'Sample diagram not found.')
        name = path.stem
        image_path = '/diagram_samples/' + filename
    else:
        raise HTTPException(422, 'Upload a diagram or select a sample.')

    def extract():
        result = FOCVPipeline().process_image(str(path))
        files = result.save(str(STATIC_DIR / 'artifacts'), uuid.uuid4().hex)
        uncertainties = result.visual_evidence_graph.get('uncertainties', [])
        return {
            'diagram_name': name, 'status': 'extracted',
            'architecture_graph': result.architecture_graph,
            'visual_evidence_graph': result.visual_evidence_graph,
            'processing_stats': result.processing_stats,
            'warnings': [item.get('detail', str(item)) for item in uncertainties],
            'overlay_url': asset_url('/static/artifacts/' + Path(files['overlay_image']).name),
            'image_url': asset_url(image_path),
        }
    try:
        async with audit_slots:
            return await run_in_threadpool(extract)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(503, 'OCR is unavailable or timed out. Check the local Tesseract installation.') from exc


@app.post("/api/audit/execute")
async def execute_audit(
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Run full FOCV + LangGraph audit, capture transparency traces, and persist audit record."""
    content_type = request.headers.get("content-type", "")
    image_file = None
    requirements_file = None

    if "application/json" in content_type:
        body = await request.json()
        requirements_text = body.get("requirements_text", "")
        diagram_name = body.get("diagram_name", "architecture_diagram")
        sample_diagram = body.get("sample_diagram") or body.get("diagram_name")
    else:
        form = await request.form()
        requirements_text = str(form.get("requirements_text", ""))
        diagram_name = str(form.get("diagram_name", "architecture_diagram"))
        sample_diagram = form.get("sample_diagram")
        if "image_file" in form and hasattr(form["image_file"], "filename"):
            image_file = form["image_file"]
        if "requirements_file" in form and hasattr(form["requirements_file"], "filename"):
            requirements_file = form["requirements_file"]

    # If user provided a requirements file, parse it
    if requirements_file and requirements_file.filename:
        req_bytes = await read_upload(requirements_file)
        if not str(requirements_text).strip():
            try:
                parsed = await run_in_threadpool(parse_any_document, req_bytes, requirements_file.filename)
                requirements_text = parsed["extracted_text"]
            except ValueError as exc:
                raise HTTPException(422, str(exc)) from exc

    if not isinstance(requirements_text, str) or not requirements_text.strip():
        raise HTTPException(422, "Provide non-empty architecture requirements.")
    if len(requirements_text) > 100000:
        raise HTTPException(413, "Requirements exceed 100,000 characters; split the specification.")

    # Resolve image path
    temp_img_path = None
    image_url = None

    if image_file and image_file.filename:
        # Save uploaded image
        content = await read_upload(image_file)
        validate_image(content)
        extension = Path(image_file.filename).suffix.lower()
        if extension not in {".png", ".jpg", ".jpeg", ".webp"}:
            raise HTTPException(422, "Use PNG, JPEG or WebP images.")
        save_name = f"{uuid.uuid4().hex}{extension}"
        dest_path = STATIC_DIR / "uploads" / save_name
        with open(dest_path, "wb") as f_out:
            f_out.write(content)
        temp_img_path = str(dest_path)
        image_url = f"/static/uploads/{save_name}"
        effective_name = Path(image_file.filename.replace("\\", "/")).stem[:200]

    elif sample_diagram:
        # Use existing sample diagram
        # If user passed just 'diagram6' instead of 'diagram6.png'
        sample_filename = sample_diagram if str(sample_diagram).endswith(".png") else f"{sample_diagram}.png"
        sample_path = (DIAGRAMS_DIR / sample_filename).resolve()
        if sample_path.parent != DIAGRAMS_DIR.resolve():
            raise HTTPException(400, "Invalid sample diagram name.")
        if not sample_path.exists():
            raise HTTPException(status_code=404, detail=f"Sample diagram {sample_diagram} not found.")
        temp_img_path = str(sample_path)
        image_url = f"/diagram_samples/{sample_filename}"
        effective_name = Path(sample_filename).stem

    else:
        raise HTTPException(status_code=400, detail="Either an image file upload or a sample_diagram must be provided.")

    try:
        # Run Full Audit Pipeline
        async with audit_slots:
            result = await run_in_threadpool(runner.run,
                image_path=temp_img_path,
                requirements_text=requirements_text,
                diagram_name=effective_name
            )

        # Persist Audit in SQLite
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO audits (
                user_id, diagram_name, image_path, overlay_path, requirements_text,
                architecture_graph, visual_evidence_graph, parsed_requirements,
                discrepancy_report, synthesized_architecture, mermaid_code,
                transparency_traces, alignment_score, executive_verdict,
                knowledge_chunks, processing_stats, warnings, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            current_user["id"],
            effective_name,
            image_url,
            result["overlay_url"],
            requirements_text,
            json.dumps(result["architecture_graph"]),
            json.dumps(result["visual_evidence_graph"]),
            json.dumps(result["parsed_requirements"]),
            json.dumps(result["discrepancy_report"]),
            json.dumps(result["synthesized_architecture"]),
            result["mermaid_code"],
            json.dumps(result["transparency_traces"]),
            result["alignment_score"],
            result["executive_verdict"],
            json.dumps(result.get("knowledge_chunks", [])),
            json.dumps(result.get("processing_stats", {})),
            json.dumps(result.get("warnings", [])),
            result.get("status", "needs_review")
        ))
        conn.commit()
        audit_id = cursor.lastrowid
        conn.close()

        result["id"] = audit_id
        result["image_url"] = image_url
        result["user_id"] = current_user["id"]
        result["username"] = current_user["username"]
        result["verdict"] = result["executive_verdict"]
        result["discrepancies"] = result["discrepancy_report"].get("discrepancies", [])
        result['image_url'] = asset_url(result['image_url'])
        result['overlay_url'] = asset_url(result['overlay_url'])

        return result

    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except RuntimeError as exc:
        logging.getLogger(__name__).error("Audit dependency failed (%s)", type(exc).__name__)
        raise HTTPException(502, "Audit could not complete. Check configured LLM providers, quotas and OCR availability in server diagnostics.") from exc


# =============================================================================
# AUDIT HISTORY (PER-USER & ADMIN ALL AUDITS)
# =============================================================================
@app.get("/api/audits")
def get_audits(all_users: bool = False, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Fetch audits. Normal users see only their own. Admin sees all audits across all users."""
    conn = get_db_connection()
    cursor = conn.cursor()

    if current_user["role"] == "admin" and all_users:
        cursor.execute("""
            SELECT a.id, a.user_id, u.username, a.diagram_name, a.image_path, a.overlay_path,
                   a.alignment_score, a.executive_verdict, a.created_at
            FROM audits a
            JOIN users u ON a.user_id = u.id
            ORDER BY a.created_at DESC
        """)
    else:
        cursor.execute("""
            SELECT a.id, a.user_id, u.username, a.diagram_name, a.image_path, a.overlay_path,
                   a.alignment_score, a.executive_verdict, a.created_at
            FROM audits a
            JOIN users u ON a.user_id = u.id
            WHERE a.user_id = ?
            ORDER BY a.created_at DESC
        """, (current_user["id"],))

    rows = cursor.fetchall()
    conn.close()

    audits = [dict(r) for r in rows]
    for audit in audits:
        audit['image_path'] = asset_url(audit['image_path'])
        audit['overlay_path'] = asset_url(audit['overlay_path'])
    return {"audits": audits}


@app.get("/api/audits/{audit_id}")
def get_audit_detail(audit_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Retrieve full audit record with verification of user ownership or admin access."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT a.*, u.username
        FROM audits a
        JOIN users u ON a.user_id = u.id
        WHERE a.id = ?
    """, (audit_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Audit not found.")

    audit = dict(row)
    # Check permissions
    if current_user["role"] != "admin" and audit["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied to this audit.")

    # Unpack JSON strings
    audit["architecture_graph"] = json.loads(audit["architecture_graph"] or "{}")
    audit["visual_evidence_graph"] = json.loads(audit["visual_evidence_graph"] or "{}")
    audit["parsed_requirements"] = json.loads(audit["parsed_requirements"] or "{}")
    audit["discrepancy_report"] = json.loads(audit["discrepancy_report"] or "{}")
    audit["synthesized_architecture"] = json.loads(audit["synthesized_architecture"] or "{}")
    audit["transparency_traces"] = json.loads(audit["transparency_traces"] or "[]")
    for key, default in (("knowledge_chunks", "[]"), ("processing_stats", "{}"), ("warnings", "[]")):
        audit[key] = json.loads(audit.get(key) or default)
    audit["overlay_url"] = asset_url(audit["overlay_path"])
    audit["image_url"] = asset_url(audit["image_path"])
    audit["verdict"] = audit["executive_verdict"]
    audit["discrepancies"] = audit["discrepancy_report"].get("discrepancies", [])
    audit["status"] = audit.get("status") or "needs_review"

    return audit


@app.post("/api/audits/{audit_id}/discrepancies/{discrepancy_id}/review")
def review_discrepancy(
    audit_id: int,
    discrepancy_id: str,
    req: DiscrepancyReviewRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """User review of an individual discrepancy: accept, reject (false positive/ignore), or flag."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM audits WHERE id = ?", (audit_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Audit not found.")
    audit = dict(row)
    if current_user["role"] != "admin" and audit["user_id"] != current_user["id"]:
        conn.close()
        raise HTTPException(status_code=403, detail="Access denied.")

    report = json.loads(audit.get("discrepancy_report") or "{}")
    discrepancies = report.get("discrepancies", [])
    target = None
    for d in discrepancies:
        if d.get("id") == discrepancy_id:
            d["user_review"] = {
                "decision": req.decision,
                "note": req.note or "",
                "reviewer": current_user["username"],
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            target = d
            break
    if not target:
        conn.close()
        raise HTTPException(status_code=404, detail=f"Discrepancy '{discrepancy_id}' not found.")

    # Recompute alignment score discounting rejected discrepancies
    total = len(discrepancies)
    rejected_count = sum(1 for d in discrepancies if d.get("user_review", {}).get("decision") == "rejected")
    base_score = float(audit.get("alignment_score") or 50.0)
    adjusted_score = min(100.0, round(base_score + (rejected_count / max(1, total)) * (100.0 - base_score), 1))

    report["discrepancies"] = discrepancies
    cursor.execute(
        "UPDATE audits SET discrepancy_report = ?, alignment_score = ? WHERE id = ?",
        (json.dumps(report), adjusted_score, audit_id)
    )
    conn.commit()
    conn.close()

    return {
        "status": "success",
        "discrepancy_id": discrepancy_id,
        "decision": req.decision,
        "alignment_score": adjusted_score,
        "discrepancies": discrepancies
    }


# =============================================================================
# GROUNDED RAG CHATBOT PER AUDIT
# =============================================================================
@app.post("/api/audits/{audit_id}/chat")
def chat_with_audit(
    audit_id: int,
    req: ChatMessageRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Query the Grounded RAG Chatbot with anti-hallucination guardrails for a specific audit."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM audits WHERE id = ?", (audit_id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Audit not found.")

    audit = dict(row)
    if current_user["role"] != "admin" and audit["user_id"] != current_user["id"]:
        conn.close()
        raise HTTPException(status_code=403, detail="Access denied.")

    # Reconstruct knowledge chunks from stored audit graphs
    from llm.graph.nodes import index_knowledge_node
    state = {
        "architecture_graph": json.loads(audit["architecture_graph"] or "{}"),
        "visual_evidence_graph": json.loads(audit["visual_evidence_graph"] or "{}"),
        "discrepancy_report": json.loads(audit["discrepancy_report"] or "{}"),
        "synthesized_architecture": json.loads(audit["synthesized_architecture"] or "{}"),
        "parsed_requirements": json.loads(audit["parsed_requirements"] or "{}"),
        "requirements_text": audit["requirements_text"] or ""
    }
    chunks = json.loads(audit.get("knowledge_chunks") or "[]") or index_knowledge_node(state).get("knowledge_chunks", [])

    bot = ArchitectureChatbot(chunks, system_name=audit["diagram_name"])

    # Load prior conversation history
    cursor.execute("""
        SELECT role, content FROM audit_chats
        WHERE audit_id = ?
        ORDER BY id ASC
    """, (audit_id,))
    past_messages = cursor.fetchall()
    for m in past_messages:
        bot.history.append({"role": m["role"], "content": m["content"]})

    # Process query
    if not req.message.strip():
        conn.close()
        raise HTTPException(422, "Enter a question.")
    try:
        answer = bot.ask(req.message)
    except RuntimeError as exc:
        conn.close()
        raise HTTPException(502, "Chat provider unavailable. Please retry after checking provider quota.") from exc

    # Save turns to database
    cursor.execute(
        "INSERT INTO audit_chats (audit_id, user_id, role, content) VALUES (?, ?, 'user', ?)",
        (audit_id, current_user["id"], req.message)
    )
    cursor.execute(
        "INSERT INTO audit_chats (audit_id, user_id, role, content) VALUES (?, ?, 'assistant', ?)",
        (audit_id, current_user["id"], answer)
    )
    conn.commit()
    conn.close()

    return {"answer": answer, "citations": getattr(bot, 'last_citations', [])}


@app.get("/api/audits/{audit_id}/chat")
def get_audit_chat_history(audit_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Fetch previous chat messages for this audit."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT user_id FROM audits WHERE id = ?", (audit_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Audit not found.")

    if current_user["role"] != "admin" and row["user_id"] != current_user["id"]:
        conn.close()
        raise HTTPException(status_code=403, detail="Access denied.")

    cursor.execute("""
        SELECT id, role, content, created_at
        FROM audit_chats
        WHERE audit_id = ?
        ORDER BY id ASC
    """, (audit_id,))
    chats = [dict(c) for c in cursor.fetchall()]
    conn.close()

    return {"messages": chats}


# Mount production React frontend if built
FRONTEND_DIST = WORKSPACE_DIR / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app:app", host="127.0.0.1", port=8000, reload=True)

