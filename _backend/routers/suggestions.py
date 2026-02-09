"""OpenAI-backed suggestions for brainwave combination counts."""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, Optional, List
import httpx

from config.settings import settings

router = APIRouter(prefix="/suggestions", tags=["suggestions"])


class SuggestionsRequest(BaseModel):
    combination_counts: Dict[str, int]


class SuggestionsResponse(BaseModel):
    use_fallback: bool
    sentence: Optional[str] = None
    top: Optional[List[str]] = None
    rare: Optional[List[str]] = None


def _call_openai(counts: Dict[str, int]) -> Optional[SuggestionsResponse]:
    key = (settings.OPENAI_API_KEY or "").strip()
    if not key:
        return None
    # Build a short summary: label (count) for non-zero, and list zero-count control labels
    items = [f"{k}: {v}" for k, v in sorted(counts.items(), key=lambda x: -x[1]) if v > 0][:15]
    zeros = [k for k, v in counts.items() if v == 0]
    prompt = (
        "You are helping a user improve their BCI (brain-computer interface) control. "
        "They see brainwave pattern counts (each pattern held 3s). "
        "Given these counts (label: count), suggest in 1-2 short sentences: "
        "which patterns they hit often (use these for controls), and which they rarely hit (practice more). "
        "Keep it brief and actionable.\n\n"
        f"Non-zero counts: {items}\n"
        f"Zero counts (labels): {zeros[:20]}\n\n"
        "Reply with only the suggestion text, no preamble."
    )
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
            return SuggestionsResponse(use_fallback=False, sentence=text, top=None, rare=None)
    except Exception:
        return None


@router.post("/", response_model=SuggestionsResponse)
def get_suggestions(body: SuggestionsRequest):
    """Return AI suggestion for combination counts; use_fallback=True if OpenAI unavailable."""
    result = _call_openai(body.combination_counts)
    if result is not None:
        return result
    return SuggestionsResponse(use_fallback=True)
