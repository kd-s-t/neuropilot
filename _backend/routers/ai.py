from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Literal
import httpx

from config import get_db
from config.settings import settings
from core import get_current_active_user
from models import User, TrainingSession, AITrainingRun

router = APIRouter(prefix="/ai", tags=["ai"])

BANDS = ["Delta", "Theta", "Alpha", "Beta", "Gamma"]
GEMINI_MODEL = "gemini-2.5-flash"
MAX_POINTS_PER_SESSION = 50


class TrainAIRequest(BaseModel):
    session_ids: List[int]
    provider: Literal["openai", "gemini"] | None = None


class TrainAIResponse(BaseModel):
    id: int
    conclusion_text: str | None
    conclusion_data: dict | None


def _extract_vector(bp: dict) -> List[float] | None:
    out = []
    for b in BANDS:
        v = bp.get(b) if isinstance(bp.get(b), dict) else None
        if v is None or "power" not in v:
            return None
        out.append(float(v["power"]))
    return out if len(out) == 5 else None


def _session_summary(session: TrainingSession) -> dict:
    data = session.data if isinstance(session.data, dict) else {}
    band_list = data.get("bandPowers") or []
    vectors = []
    for bp in band_list:
        if not isinstance(bp, dict):
            continue
        vec = _extract_vector(bp)
        if vec is not None:
            vectors.append(vec)
    if not vectors:
        return {"id": session.id, "name": session.name, "points": 0}
    step = max(1, len(vectors) // MAX_POINTS_PER_SESSION)
    sampled = [vectors[i] for i in range(0, len(vectors), step)][:MAX_POINTS_PER_SESSION]
    means = [sum(v[i] for v in sampled) / len(sampled) for i in range(5)]
    scale = max(means) or 1.0
    scaled_mean = [round(x / scale, 4) for x in means]
    scaled_sample = [[round(x / scale, 4) for x in row] for row in sampled[:10]]
    return {
        "id": session.id,
        "name": session.name or f"Session {session.id}",
        "points": len(sampled),
        "mean": scaled_mean,
        "sample": scaled_sample,
    }


def _build_prompt(summaries: List[dict]) -> str:
    lines = [
        "The user has EEG training sessions. Each session has band-power time series (Delta, Theta, Alpha, Beta, Gamma), normalized to 0-1 scale.",
        "Look at the session summaries below and identify patterns: e.g. recurring band-power profiles, distinct mental states, or how they might correspond to repeated actions (e.g. turn right, turn left, blink).",
        "Reply with a short conclusion in at most 5 sentences: what patterns you see. Do not exceed 5 sentences.",
        "",
    ]
    for s in summaries:
        lines.append(f"Session id={s['id']} name={s['name']} ({s['points']} points). Mean [D,T,A,B,G]: {s['mean']}. Sample rows: {s.get('sample', [])[:5]}")
    lines.append("")
    lines.append("Conclusion:")
    return "\n".join(lines)


def _call_openai(prompt: str) -> str:
    key = (settings.OPENAI_API_KEY or "").strip()
    if not key:
        return "OPENAI_API_KEY is not set."
    url = "https://api.openai.com/v1/chat/completions"
    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.post(
                url,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 2048,
                },
            )
            if not r.is_success:
                try:
                    body = r.json()
                    msg = body.get("error", {}).get("message", r.text[:200])
                except Exception:
                    msg = r.text[:200] if r.text else str(r.status_code)
                err_msg = f"OpenAI API error ({r.status_code}): {msg}"
                print(err_msg)
                return err_msg
            data = r.json()
            text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()
            if not text:
                return "OpenAI returned empty text."
            return text
    except httpx.TimeoutException:
        return "OpenAI request timed out."
    except Exception as e:
        return f"OpenAI request failed: {e!s}"


def _call_gemini(prompt: str) -> str:
    key = (settings.GEMINI_API_KEY or "").strip()
    if not key:
        return "GEMINI_API_KEY is not set."
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.post(
                url,
                headers={"x-goog-api-key": key, "Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"maxOutputTokens": 2048},
                },
            )
            if not r.is_success:
                try:
                    body = r.json()
                    msg = body.get("error", {}).get("message", r.text[:200])
                except Exception:
                    msg = r.text[:200] if r.text else str(r.status_code)
                err_msg = f"Gemini API error ({r.status_code}): {msg}"
                print(err_msg)
                return err_msg
            data = r.json()
            cands = data.get("candidates")
            if not cands:
                feedback = (data.get("promptFeedback") or {})
                block = feedback.get("blockReason", "")
                err_msg = f"Gemini returned no reply. Block reason: {block or 'unknown'} (e.g. safety filter)."
                print(err_msg)
                return err_msg
            parts = (cands[0].get("content") or {}).get("parts") or []
            text = (parts[0].get("text") or "").strip() if parts else ""
            if not text:
                print("Gemini returned empty text.")
                return "Gemini returned empty text."
            return text
    except httpx.TimeoutException:
        return "Gemini request timed out."
    except Exception as e:
        return f"Gemini request failed: {e!s}"


@router.post("/train", response_model=TrainAIResponse)
def train_ai(
    body: TrainAIRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    if not body.session_ids:
        raise HTTPException(status_code=400, detail="session_ids required")
    sessions = (
        db.query(TrainingSession)
        .filter(
            TrainingSession.id.in_(body.session_ids),
            TrainingSession.user_id == current_user.id,
        )
        .all()
    )
    if len(sessions) != len(body.session_ids):
        raise HTTPException(status_code=404, detail="One or more sessions not found")
    summaries = [_session_summary(s) for s in sessions]
    prompt = _build_prompt(summaries)
    provider = (body.provider or settings.AI_TRAIN_PROVIDER or "gemini").strip().lower()
    if provider == "openai":
        conclusion_text = _call_openai(prompt)
    else:
        conclusion_text = _call_gemini(prompt)
    conclusion_data = {"session_ids": body.session_ids, "summaries": summaries}
    run = AITrainingRun(
        user_id=current_user.id,
        session_ids=body.session_ids,
        conclusion_text=conclusion_text,
        conclusion_data=conclusion_data,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return TrainAIResponse(
        id=run.id,
        conclusion_text=run.conclusion_text,
        conclusion_data=run.conclusion_data,
    )
