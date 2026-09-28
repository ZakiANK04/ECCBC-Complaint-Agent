"""Step 5: turn a classification's department key into real routing contacts,
using config/departments.yaml so admins/supervisors can manage contacts directly
from the Dashboard.
"""
import pathlib
import yaml

BASE_DIR = pathlib.Path(__file__).resolve().parent.parent
CONFIG_PATH = BASE_DIR / "config" / "departments.yaml"


def load_departments() -> dict:
    if not CONFIG_PATH.exists():
        return {}
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
        return data.get("departments", {})


def save_departments(departments: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        yaml.safe_dump({"departments": departments}, f, allow_unicode=True, sort_keys=False)


def get_department_contact(department_key: str) -> dict:
    departments = load_departments()
    dept = departments.get(department_key, departments.get("other", {
        "label": "General / Other",
        "contact_email": "support.rouiba@example-eccbc.dz",
        "emails": ["support.rouiba@example-eccbc.dz"]
    }))

    # Normalize emails list and primary email
    emails = dept.get("emails", [])
    if not emails and dept.get("contact_email"):
        emails = [e.strip() for e in str(dept.get("contact_email")).split(",") if e.strip()]

    primary_email = emails[0] if emails else dept.get("contact_email", "")

    return {
        "label": dept.get("label", department_key.capitalize()),
        "contact_email": primary_email,
        "emails": emails,
    }


def add_department_email(department_key: str, email: str) -> dict:
    email = email.strip()
    if not email:
        raise ValueError("Email cannot be empty.")
    departments = load_departments()
    if department_key not in departments:
        departments[department_key] = {"label": department_key.capitalize(), "emails": []}

    dept = departments[department_key]
    emails = dept.get("emails", [])
    if not emails and dept.get("contact_email"):
        emails = [e.strip() for e in str(dept.get("contact_email")).split(",") if e.strip()]

    if email not in emails:
        emails.append(email)

    dept["emails"] = emails
    dept["contact_email"] = emails[0]
    save_departments(departments)
    return departments[department_key]


def remove_department_email(department_key: str, email: str) -> dict:
    departments = load_departments()
    if department_key not in departments:
        return {}
    dept = departments[department_key]
    emails = dept.get("emails", [])
    if not emails and dept.get("contact_email"):
        emails = [e.strip() for e in str(dept.get("contact_email")).split(",") if e.strip()]

    emails = [e for e in emails if e != email]
    dept["emails"] = emails
    dept["contact_email"] = emails[0] if emails else ""
    save_departments(departments)
    return dept
