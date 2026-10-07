"""
Hybrid Classifier: Combines Machine Learning (TF-IDF + Logistic Regression)
with LLM (Gemini 3 Flash Preview) for complaint classification and routing.

Features:
- Configurable modes: 'hybrid', 'llm_only', 'lr_only'
- Configurable Logistic Regression confidence threshold and weight
- Pre-trained on multilingual ECCBC complaints (French, Darija, English)
- Online retraining on historical tickets in data/tickets.json
"""
import json
import os
import pathlib
from typing import Literal, Tuple, Dict, Any, Optional

import joblib
from pydantic import BaseModel
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

from src.classify import ComplaintClassification, classify_complaint

BASE_DIR = pathlib.Path(__file__).resolve().parent.parent
CONFIG_PATH = BASE_DIR / "config" / "agent_config.json"
MODEL_PATH = BASE_DIR / "data" / "models" / "lr_classifier.joblib"
TICKETS_PATH = BASE_DIR / "data" / "tickets.json"

DEFAULT_CONFIG = {
    "classification_mode": "hybrid",       # "hybrid", "llm_only", "lr_only"
    "lr_confidence_threshold": 0.60,       # Min confidence for LR to dispute LLM
    "lr_weight": 0.50,                     # 0.0 (Pure LLM) to 1.0 (Pure LR)
    "model_name": "gemini-3-flash-preview",
}

# High-quality multilingual seed dataset for ECCBC Rouiba complaints
SEED_COMPLAINTS = [
    # Quality (Broken bottles, flat beverage, taste/smell, foreign object)
    ("J'ai reçu des bouteilles de Coca-Cola cassées et du verre partout.", "quality", "Damaged product"),
    ("La bouteille de Fanta était sans gaz, le goût est complètement plat.", "quality", "Taste / Gas defect"),
    ("Un pack de Sprite présentait une odeur anormale et un dépôt au fond.", "quality", "Contamination / Quality defect"),
    ("Bouteilles de Coca Zéro 1L avec capsule défectueuse qui fuit.", "quality", "Packaging / Leak"),
    ("Le plastique du pack est déchiré et 3 canettes sont percées.", "quality", "Damaged product"),
    ("Gout bizar f l coca w mafihach gaz ga3.", "quality", "Taste / Gas defect"),
    ("Qra3i mtekssrin f l casier li wssal lyoum.", "quality", "Damaged product"),
    ("L'emballage de la palette était écrasé à la livraison.", "quality", "Damaged product"),
    ("Produit périmé reçu dans la dernière commande de Rouiba.", "quality", "Expired product"),
    ("Le liquide a une couleur bizarre et ne pétille pas.", "quality", "Taste / Gas defect"),

    # Logistics (Late delivery, driver issue, route delay, unfulfilled delivery)
    ("Le camion de livraison avait 4 heures de retard, nos rayons sont restés vides.", "logistics", "Late delivery"),
    ("Livraison non reçue à l'heure convenue à Rouiba.", "logistics", "Delivery delay"),
    ("Le chauffeur a refusé de décharger les palettes au dépôt.", "logistics", "Driver / Unloading issue"),
    ("Retard critique sur notre commande de boissons gazeuses ce matin.", "logistics", "Late delivery"),
    ("Le transporteur n'est jamais passé aujourd'hui comme prévu.", "logistics", "Missed delivery"),
    ("Camion ma jach f lwaqt w lmagaza fergha.", "logistics", "Late delivery"),
    ("Chauffeur ma habch ykheli sel3a fel hangar.", "logistics", "Driver / Unloading issue"),
    ("La livraison a été effectuée à une mauvaise adresse.", "logistics", "Wrong address delivery"),
    ("Le livreur est arrivé après les heures de fermeture du magasin.", "logistics", "Delivery schedule"),

    # Commercial (Promotions, discounts, sales terms, missing quantities, client relation)
    ("Il manque 5 caisses de Coca-Cola dans la livraison par rapport au bon de commande.", "commercial", "Missing products"),
    ("La remise commerciale promise par notre délégué commercial n'apparaît pas.", "commercial", "Discount / Promotion"),
    ("Le commercial ne répond plus à nos commandes de réapprovisionnement.", "commercial", "Sales rep unavailable"),
    ("Commande validée avec le représentant mais non transmise à l'usine.", "commercial", "Order discrepancy"),
    ("Sel3a naqsa 5 fardeaux par rapport l bon.", "commercial", "Missing products"),
    ("Khasna remise kima tfahamna m3a le commercial.", "commercial", "Discount / Promotion"),
    ("Problème de volume alloué sur notre contrat de distribution.", "commercial", "Contract / Commercial terms"),
    ("Pas de nouvelles de notre commercial pour la foire annuelle.", "commercial", "Sales rep inquiry"),

    # Billing (Invoicing error, credit note, duplicate charge, tax calculation)
    ("Erreur sur le montant de la facture: le prix unitaire appliqué n'est pas le bon.", "billing", "Price discrepancy"),
    ("Facture reçue deux fois pour la même livraison de palettes.", "billing", "Duplicate invoice"),
    ("L'avoir promis pour les bouteilles consignées n'a toujours pas été déduit.", "billing", "Credit note / Consignation"),
    ("Le montant de la TVA est erroné sur la facture n° 45892.", "billing", "Tax calculation error"),
    ("Problème de rapprochement bancaire et de reçu de paiement.", "billing", "Payment confirmation"),
    ("Ghalta f la facture, l'prix zaydou fih.", "billing", "Price discrepancy"),
    ("Mazal ma b3atoulna l'avoir ta3 lqra3i lferghin.", "billing", "Credit note / Consignation"),
    ("Délai de paiement non respecté sur l'échéancier commercial.", "billing", "Payment terms"),

    # Other (General inquiries, sponsorship, visiting plant, jobs)
    ("Demande de sponsoring pour un événement sportif local.", "other", "Sponsorship / Event"),
    ("Bonjour, comment visiter l'usine de Rouiba avec nos étudiants ?", "other", "Plant visit inquiry"),
    ("Je souhaite postuler pour un poste de technicien de maintenance.", "other", "Job application"),
    ("Renseignements généraux sur les horaires d'ouverture du siège.", "other", "General inquiry"),
    ("Kifeh ndirou demande de stage à Rouiba ?", "other", "Internship / General inquiry"),
]


def load_agent_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                saved = json.load(f)
                return {**DEFAULT_CONFIG, **saved}
        except Exception:
            pass
    return DEFAULT_CONFIG.copy()


def save_agent_config(config: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


def get_training_data() -> Tuple[list[str], list[str], list[str]]:
    """Combines seed complaints with real tickets stored in tickets.json."""
    texts = [item[0] for item in SEED_COMPLAINTS]
    depts = [item[1] for item in SEED_COMPLAINTS]
    types = [item[2] for item in SEED_COMPLAINTS]

    if TICKETS_PATH.exists():
        try:
            with open(TICKETS_PATH, "r", encoding="utf-8") as f:
                tickets = json.load(f)
                for t in tickets:
                    txt = t.get("complaint_text", "").strip()
                    d = t.get("department", "").strip()
                    pt = t.get("problem_type", "").strip()
                    if txt and d:
                        texts.append(txt)
                        depts.append(d)
                        types.append(pt if pt else "General issue")
        except Exception:
            pass

    return texts, depts, types


def train_logistic_models() -> dict:
    """Trains TF-IDF + Logistic Regression pipelines for department and problem_type."""
    texts, depts, types = get_training_data()

    dept_pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True)),
        ("clf", LogisticRegression(C=1.0, max_iter=1000, random_state=42))
    ])
    dept_pipeline.fit(texts, depts)

    type_pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True)),
        ("clf", LogisticRegression(C=1.0, max_iter=1000, random_state=42))
    ])
    type_pipeline.fit(texts, types)

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "dept_model": dept_pipeline,
        "type_model": type_pipeline,
        "sample_count": len(texts),
        "classes_dept": list(dept_pipeline.classes_),
        "classes_type": list(type_pipeline.classes_),
    }, MODEL_PATH)

    return {
        "status": "trained",
        "sample_count": len(texts),
        "department_classes": list(dept_pipeline.classes_),
        "type_classes": list(type_pipeline.classes_)
    }


def _ensure_models():
    if not MODEL_PATH.exists():
        train_logistic_models()
    return joblib.load(MODEL_PATH)


def predict_logistic(complaint_text: str) -> dict:
    """Runs Logistic Regression inference and returns predictions + confidence."""
    models_dict = _ensure_models()
    dept_pipeline = models_dict["dept_model"]
    type_pipeline = models_dict["type_model"]

    # Predict department
    dept_proba = dept_pipeline.predict_proba([complaint_text])[0]
    dept_idx = dept_proba.argmax()
    dept_pred = str(dept_pipeline.classes_[dept_idx])
    dept_conf = float(dept_proba[dept_idx])

    # Predict problem type
    type_proba = type_pipeline.predict_proba([complaint_text])[0]
    type_idx = type_proba.argmax()
    type_pred = str(type_pipeline.classes_[type_idx])
    type_conf = float(type_proba[type_idx])

    return {
        "department": dept_pred,
        "department_confidence": round(dept_conf, 3),
        "problem_type": type_pred,
        "problem_type_confidence": round(type_conf, 3),
        "department_distribution": {
            str(cls): round(float(prob), 3) for cls, prob in zip(dept_pipeline.classes_, dept_proba)
        }
    }


def classify_locally(complaint_text: str) -> Tuple[ComplaintClassification, dict]:
    """Provide a usable offline/demo classification when Gemini is not configured.

    The prototype must still be able to create, route and report tickets on a
    developer machine without exposing an API key.  This intentionally uses
    the same locally trained TF-IDF model as ``lr_only`` mode.
    """
    lr_result = predict_logistic(complaint_text)
    text = complaint_text.lower()
    high_priority_terms = (
        "urgent", "urgence", "critique", "danger", "verre", "glass",
        "contamin", "poison", "bless", "hospital", "rayons vides",
    )
    urgency = "high" if any(term in text for term in high_priority_terms) else "medium"
    classification = ComplaintClassification(
        problem_type=lr_result["problem_type"],
        department=lr_result["department"],
        sentiment="negative",
        urgency=urgency,
        summary=f"Customer complaint concerning {lr_result['problem_type']}.",
    )
    return classification, {
        "mode": "local_fallback",
        "decision": "local_logistic_regression (Gemini not configured)",
        "lr_prediction": lr_result,
    }


def classify_hybrid(
    client,
    complaint_text: str,
    override_config: Optional[dict] = None
) -> Tuple[ComplaintClassification, dict]:
    """
    Executes the Hybrid Classification pipeline:
    1. Loads current configuration (mode, weights, threshold)
    2. Runs Logistic Regression and/or Gemini LLM
    3. Blends results and returns the final validated classification + meta
    """
    config = {**load_agent_config(), **(override_config or {})}
    mode = config.get("classification_mode", "hybrid")
    threshold = float(config.get("lr_confidence_threshold", 0.60))
    weight = float(config.get("lr_weight", 0.50))
    model_name = config.get("model_name", "gemini-3-flash-preview")

    lr_result = predict_logistic(complaint_text)

    # 1. Mode: LR Only
    if mode == "lr_only":
        final_dept = lr_result["department"]
        final_type = lr_result["problem_type"]
        summary = f"Complaint concerning {final_type} ({final_dept})"
        classification = ComplaintClassification(
            problem_type=final_type,
            department=final_dept,
            sentiment="negative",
            urgency="medium",
            summary=summary,
        )
        meta = {
            "mode": "lr_only",
            "lr_result": lr_result,
            "decision": "pure_logistic_regression",
            "lr_weight": weight,
            "threshold": threshold,
        }
        return classification, meta

    # 2. Run LLM
    llm_classification = classify_complaint(client, complaint_text, model=model_name)

    # 3. Mode: LLM Only
    if mode == "llm_only":
        meta = {
            "mode": "llm_only",
            "lr_result": lr_result,
            "llm_result": llm_classification.model_dump(),
            "decision": "pure_llm",
            "lr_weight": weight,
            "threshold": threshold,
        }
        return llm_classification, meta

    # 4. Mode: Hybrid (Ensemble)
    llm_dept = llm_classification.department.lower()
    lr_dept = lr_result["department"].lower()
    lr_conf = lr_result["department_confidence"]

    agreement = (llm_dept == lr_dept)

    if agreement:
        final_dept = llm_dept
        final_type = llm_classification.problem_type
        decision = "full_agreement"
    else:
        # Conflict resolution between LR and LLM based on configured weight and threshold
        # If LR confidence is very high AND lr_weight > 0.5, LR wins department
        if lr_conf >= threshold and weight > 0.5:
            final_dept = lr_dept
            final_type = lr_result["problem_type"]
            decision = f"lr_override (LR conf {lr_conf:.2f} >= {threshold:.2f} with weight {weight})"
        else:
            final_dept = llm_dept
            final_type = llm_classification.problem_type
            decision = f"llm_preference (LLM selected over LR conf {lr_conf:.2f})"

    hybrid_classification = ComplaintClassification(
        problem_type=final_type,
        department=final_dept,
        sentiment=llm_classification.sentiment,
        urgency=llm_classification.urgency,
        summary=llm_classification.summary,
    )

    meta = {
        "mode": "hybrid",
        "decision": decision,
        "agreement": agreement,
        "lr_weight": weight,
        "threshold": threshold,
        "lr_prediction": lr_result,
        "llm_prediction": llm_classification.model_dump(),
    }
    return hybrid_classification, meta
