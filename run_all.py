"""DiagramFlow Unified Launcher.

Starts the unified FastAPI application serving:
  - React Production UI:  http://127.0.0.1:8000/
  - Interactive API Docs: http://127.0.0.1:8000/docs
"""

import os
import sys
from pathlib import Path

def main():
    workspace = Path(__file__).resolve().parent
    dist_html = workspace / "frontend" / "dist" / "index.html"
    if not dist_html.exists():
        print("Notice: Frontend production build not found at frontend/dist/index.html.")
        print("To build the UI bundle, run:")
        print("  cd frontend && npm install && npm run build\n")

    host = os.environ.get("DIAGRAMFLOW_HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))

    print("=" * 65)
    print("  🚀 DiagramFlow — Vision-Grounded Architecture Audit")
    print("=" * 65)
    print(f"  ► Unified Application (UI & API): http://{host}:{port}")
    print(f"  ► Interactive OpenAPI Docs:      http://{host}:{port}/docs")
    print("=" * 65)
    print("  Auth: Create an account via UI or POST /api/auth/register")
    print("  Press Ctrl+C to terminate.")
    print("=" * 65)

    try:
        import uvicorn
        uvicorn.run("backend.app:app", host=host, port=port, reload=False)
    except KeyboardInterrupt:
        print("\nDiagramFlow server stopped.")


if __name__ == "__main__":
    main()
