"""
Use Gemini as the event classifier: prompt includes per-class band-power summaries
built from training_sessions only (session.name = action label). No bindings.
"""
import httpx
import time
from typing import Dict, Any, Optional, Tuple, List

from config.settings import settings

BANDS = ["Delta", "Theta", "Alpha", "Beta", "Gamma"]
GEMINI_MODEL = "gemini-2.5-flash"
_CONTEXT_CACHE: Optional[Dict[str, List[float]]] = None
_CONTEXT_CACHE_TIME: float = 0
_CONTEXT_CACHE_TTL = 60.0


def _extract_vector(bp: dict) -> Optional[List[float]]:
    out = []
    for b in BANDS:
        v = bp.get(b) if isinstance(bp.get(b), dict) else None
        if v is None or "power" not in v:
            return None
        out.append(float(v["power"]))
    return out


def build_context_from_db(db) -> Dict[str, List[float]]:
    from models import TrainingSession
    sessions = db.query(TrainingSession).all()
    by_label: Dict[str, List[List[float]]] = {}
    for session in sessions:
        if not session.data:
            continue
        label = (session.name or "").strip() or f"session_{session.id}"
        data = session.data if isinstance(session.data, dict) else {}
        band_list = data.get("bandPowers") or []
        for bp in band_list:
            if not isinstance(bp, dict):
                continue
            vec = _extract_vector(bp)
            if vec is not None:
                by_label.setdefault(label, []).append(vec)
    result = {}
    for label, vectors in by_label.items():
        if not vectors:
            continue
        mean_vec = [sum(v[i] for v in vectors) / len(vectors) for i in range(5)]
        result[label] = mean_vec
    return result


def _get_cached_context(db):
    global _CONTEXT_CACHE, _CONTEXT_CACHE_TIME
    now = time.monotonic()
    if _CONTEXT_CACHE is not None and (now - _CONTEXT_CACHE_TIME) < _CONTEXT_CACHE_TTL:
        return _CONTEXT_CACHE
    _CONTEXT_CACHE = build_context_from_db(db)
    _CONTEXT_CACHE_TIME = now
    return _CONTEXT_CACHE


def _build_prompt(context: Dict[str, List[float]], current: List[float]) -> str:
    lines = [
        "You classify EEG band-power readings (Delta, Theta, Alpha, Beta, Gamma) into one action.",
        "Each action has a typical profile (mean band powers from training).",
        "Reply with only the single action label that best matches the current reading, nothing else.",
        "",
        "Action profiles (action: [Delta, Theta, Alpha, Beta, Gamma]):",
    ]
    for label, vec in context.items():
        lines.append(f"  {label}: {[round(x, 2) for x in vec]}")
    lines.append("")
    lines.append(f"Current reading: {[round(x, 2) for x in current]}")
    lines.append("Action label:")
    return "\n".join(lines)


def predict_event_gemini(
    band_powers: Dict[str, Any],
    db,
) -> Tuple[Optional[str], float]:
    key = (settings.GEMINI_API_KEY or "").strip()
    if not key:
        return None, 0.0
    vec = []
    for b in BANDS:
        v = band_powers.get(b)
        p = float((v.get("power", 0) or 0)) if isinstance(v, dict) else 0.0
        vec.append(p)
    if len(vec) != 5:
        return None, 0.0
    context = _get_cached_context(db)
    if not context:
        return None, 0.0
    prompt = _build_prompt(context, vec)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    try:
        with httpx.Client(timeout=8.0) as client:
            r = client.post(
                url,
                headers={"x-goog-api-key": key, "Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"maxOutputTokens": 30},
                },
            )
            if not r.is_success:
                return None, 0.0
            data = r.json()
            cands = data.get("candidates") or [{}]
            parts = (cands[0].get("content") or {}).get("parts") or [{}]
            text = (parts[0].get("text") or "").strip()
            if not text:
                return None, 0.0
            raw = text.split("\n")[0].strip().split()[0] if text else ""
            if raw in context:
                return raw, 0.8
            for known in context:
                if known.lower() == raw.lower():
                    return known, 0.8
            return None, 0.0
    except Exception:
        return None, 0.0
