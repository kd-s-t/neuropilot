"""AI-backed suggestions for brainwave combination counts (OpenAI or Gemini)."""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, Optional, List, Literal
import httpx

from config.settings import settings

router = APIRouter(prefix="/suggestions", tags=["suggestions"])

Provider = Literal["openai", "gemini"]


class SuggestionsRequest(BaseModel):
    combination_counts: Dict[str, int]
    provider: Provider = "openai"


class SuggestionsResponse(BaseModel):
    use_fallback: bool
    sentence: Optional[str] = None
    top: Optional[List[str]] = None
    rare: Optional[List[str]] = None
    provider: Optional[Provider] = None


def _prompt(counts: Dict[str, int]) -> str:
    items = [f"{k}: {v}" for k, v in sorted(counts.items(), key=lambda x: -x[1]) if v > 0][:15]
    zeros = [k for k, v in counts.items() if v == 0]
    return (
        "You are helping a user improve their BCI (brain-computer interface) control. "
        "They see brainwave pattern counts (each pattern held 3s). "
        "Given these counts (label: count), suggest in 1-2 short sentences: "
        "which patterns they hit often (use these for controls), and which they rarely hit (practice more). "
        "Keep it brief and actionable.\n\n"
        f"Non-zero counts: {items}\n"
        f"Zero counts (labels): {zeros[:20]}\n\n"
        "Reply with only the suggestion text, no preamble."
    )


def _call_openai(counts: Dict[str, int]) -> Optional[SuggestionsResponse]:
    key = (settings.OPENAI_API_KEY or "").strip()
    if not key:
        return None
    prompt = _prompt(counts)
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 200,
                },
            )
            r.raise_for_status()
            data = r.json()
            text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()
            if not text:
                return None
            return SuggestionsResponse(use_fallback=False, sentence=text, top=None, rare=None, provider="openai")
    except Exception:
        return None


def _call_gemini(counts: Dict[str, int]) -> Optional[SuggestionsResponse]:
    key = (settings.GEMINI_API_KEY or "").strip()
    if not key:
        return None
    prompt = _prompt(counts)
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.post(
                url,
                headers={"x-goog-api-key": key, "Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"maxOutputTokens": 200},
                },
            )
            r.raise_for_status()
            data = r.json()
            cands = data.get("candidates") or [{}]
            parts = (cands[0].get("content") or {}).get("parts") or [{}]
            text = (parts[0].get("text") or "").strip()
            if not text:
                return None
            return SuggestionsResponse(use_fallback=False, sentence=text, top=None, rare=None, provider="gemini")
    except Exception:
        return None


@router.post("/", response_model=SuggestionsResponse)
def get_suggestions(body: SuggestionsRequest):
    if body.provider == "gemini":
        result = _call_gemini(body.combination_counts)
    else:
        result = _call_openai(body.combination_counts)
    if result is not None:
        return result
    return SuggestionsResponse(use_fallback=True, provider=body.provider)
