"""Load explicit environment configuration without overriding process settings."""
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / '.env', override=False)
load_dotenv(ROOT / 'llm' / '.env', override=False)
