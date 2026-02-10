"""
Train an event classifier from training_sessions + machine_control_bindings.
Labels = control_id from each binding. Features = band powers from session.data["bandPowers"].
Run from backend dir: python train_event_model.py
Saves model to models/event_model.pkl and label list to models/event_model_labels.json.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config.database import SessionLocal
from models import TrainingSession, MachineControlBinding

BANDS = ["Delta", "Theta", "Alpha", "Beta", "Gamma"]
SAVED_DIR = os.path.join(os.path.dirname(__file__), "saved_models")
MODEL_PATH = os.path.join(SAVED_DIR, "event_model.pkl")
LABELS_PATH = os.path.join(SAVED_DIR, "event_model_labels.json")


def extract_vector(bp: dict) -> list | None:
    out = []
    for b in BANDS:
        val = bp.get(b) if isinstance(bp.get(b), dict) else None
        if val is None or "power" not in val:
            return None
        out.append(float(val["power"]))
    return out


def load_training_data(db):
    bindings = db.query(MachineControlBinding).all()
    session_ids_with_label = {}
    for b in bindings:
        session_ids_with_label[b.training_session_id] = b.control_id

    X, y = [], []
    for session_id, label in session_ids_with_label.items():
        session = db.query(TrainingSession).filter(TrainingSession.id == session_id).first()
        if not session or not session.data:
            continue
        data = session.data if isinstance(session.data, dict) else {}
        band_list = data.get("bandPowers") or []
        for bp in band_list:
            if not isinstance(bp, dict):
                continue
            vec = extract_vector(bp)
            if vec is not None:
                X.append(vec)
                y.append(label)
    return X, y


def main():
    try:
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.model_selection import train_test_split
    except ImportError:
        print("Install scikit-learn: pip install scikit-learn")
        return 1

    db = SessionLocal()
    try:
        X, y = load_training_data(db)
    finally:
        db.close()

    if not X or not y:
        print("No training data. Record sessions and bind them to controls, then run again.")
        return 1

    labels_sorted = sorted(set(y))
    label_to_idx = {L: i for i, L in enumerate(labels_sorted)}
    y_idx = [label_to_idx[lab] for lab in y]

    X_train, X_test, y_train, y_test = train_test_split(X, y_idx, test_size=0.2, random_state=42, stratify=y_idx)
    clf = RandomForestClassifier(n_estimators=100, random_state=42, min_samples_leaf=2)
    clf.fit(X_train, y_train)
    acc = clf.score(X_test, y_test)
    print(f"Train samples: {len(X_train)}, Test samples: {len(X_test)}, Test accuracy: {acc:.3f}")

    os.makedirs(SAVED_DIR, exist_ok=True)
    import pickle
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(clf, f)
    with open(LABELS_PATH, "w") as f:
        json.dump(labels_sorted, f)
    print(f"Saved model to {MODEL_PATH}, labels to {LABELS_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
