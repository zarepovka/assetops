from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone


LOCAL_MODEL_NAME = "assetops-local-v1"
LOCAL_PROVIDER_NAME = "AssetOps Local AI"

PRIORITY_SCORES = {
    "низкий": 1,
    "средний": 2,
    "высокий": 3,
    "критический": 4,
}

SCORE_TO_PRIORITY = {
    1: "низкий",
    2: "средний",
    3: "высокий",
    4: "критический",
}

CATEGORY_KEYWORDS = {
    "Сеть": [
        "сеть",
        "маршрутиз",
        "коммутатор",
        "uplink",
        "потеря пакетов",
        "соединение",
        "wifi",
        "wi-fi",
        "канал",
        "порт",
        "интернет",
    ],
    "Сервер": [
        "сервер",
        "резервн",
        "backup",
        "raid",
        "база данных",
        "архив",
        "хранилищ",
        "виртуал",
        "копирован",
    ],
    "ПО": [
        "ос",
        "операцион",
        "приложен",
        "1с",
        "office",
        "драйвер",
        "обновлен",
        "загрузк",
        "ssd",
        "диск",
        "файлов",
    ],
    "Периферия": [
        "принтер",
        "мфу",
        "сканер",
        "печать",
        "бумаг",
        "картридж",
        "этикет",
        "перифер",
    ],
    "Оборудование": [
        "перегрев",
        "ноутбук",
        "пк",
        "рабочая станция",
        "монитор",
        "питани",
        "блок питания",
        "клавиат",
        "мыш",
        "аппарат",
    ],
    "Безопасность": [
        "безопас",
        "вирус",
        "утечк",
        "доступ",
        "шифров",
        "антивирус",
        "запрет",
        "политика",
        "acl",
    ],
}

SEVERE_KEYWORDS = [
    "не загружается",
    "не проходит загрузку",
    "ошибка резервного копирования",
    "отсутствует соединение",
    "потеря пакетов",
    "недоступно",
    "деградация",
    "ошибка загрузочного диска",
    "не сформирован полный архив",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def analyze_ticket(payload: dict) -> dict:
    ticket = payload.get("ticket")

    if not isinstance(ticket, dict):
        raise ValueError("В запросе отсутствует ticket context.")

    settings = payload.get("settings") or {}
    auto_priority = settings.get("autoPriority") or {}
    repeated_threshold = max(2, int(auto_priority.get("repeatedIncidentThreshold", 2) or 2))

    text = build_ticket_text(ticket)
    category_scores = score_categories(text, ticket.get("category"))
    inferred_category = resolve_category(category_scores, ticket.get("category"))

    base_priority = str(ticket.get("basePriority") or ticket.get("finalPriority") or "средний").lower()
    score = PRIORITY_SCORES.get(base_priority, 2)
    rationale: list[str] = []
    severity_signals = 0

    equipment = ticket.get("equipment") or {}
    status = str(ticket.get("status") or "").lower()
    sla_percent = int(ticket.get("slaConsumedPercent") or 0)
    incident_count = int(equipment.get("incidentCount") or 0)
    department = str(equipment.get("department") or "")
    criticality = str(equipment.get("criticality") or "").lower()

    if criticality == "high":
        score += 1
        rationale.append("Связанная техника относится к критичной инфраструктуре.")

    if inferred_category in {"Сеть", "Сервер", "Безопасность"}:
        score += 1
        rationale.append("Инцидент затрагивает инфраструктурный или сервисный контур.")

    if "Производственный" in department:
        score += 1
        rationale.append("Неисправность влияет на производственный процесс.")

    if incident_count >= repeated_threshold:
        score += 1
        rationale.append("По данной единице техники уже фиксировались повторные обращения.")

    if status == "просрочена":
        score += 1
        rationale.append("Превышен нормативный срок обработки заявки.")

    if sla_percent >= 100:
        score += 1
        rationale.append("SLA по заявке исчерпан или находится в зоне нарушения.")

    if has_any(text, SEVERE_KEYWORDS):
        score += 1
        severity_signals += 1
        rationale.append("Текст инцидента содержит признаки критического отказа или полной недоступности сервиса.")

    if any(word in text for word in ("ssd", "диск", "raid", "резервного копирования", "архив", "питания")):
        severity_signals += 1

    score = min(score, 4)
    proposed_priority = SCORE_TO_PRIORITY[score]

    if len(rationale) < 2:
        fallback = [
            "Заявка требует стандартного сопровождения по регламенту service desk.",
            "Признаки инцидента не указывают на необходимость немедленной эскалации сверх базового уровня.",
        ]
        for item in fallback:
            if item not in rationale:
                rationale.append(item)
            if len(rationale) >= 2:
                break

    confidence = resolve_confidence(rationale, category_scores, severity_signals)
    next_steps = build_next_steps(inferred_category, ticket, equipment)
    risks = build_risks(inferred_category, ticket, equipment, proposed_priority)
    summary = build_summary(inferred_category, proposed_priority, ticket, equipment)
    executive_note = build_executive_note(proposed_priority, inferred_category, risks)

    return {
        "summary": summary,
        "proposedPriority": proposed_priority,
        "category": inferred_category,
        "confidence": confidence,
        "rationale": rationale[:5],
        "nextSteps": next_steps[:5],
        "risks": risks[:4],
        "executiveNote": executive_note,
        "generatedAt": utc_now(),
        "provider": LOCAL_PROVIDER_NAME,
        "model": LOCAL_MODEL_NAME,
    }


def build_ticket_text(ticket: dict) -> str:
    parts = [
        ticket.get("problemType", ""),
        ticket.get("category", ""),
        ticket.get("description", ""),
        ticket.get("result", ""),
    ]

    equipment = ticket.get("equipment") or {}
    parts.extend(
        [
            equipment.get("name", ""),
            equipment.get("type", ""),
            equipment.get("department", ""),
            equipment.get("status", ""),
        ]
    )

    for item in ticket.get("history", []):
        parts.append(item.get("comment", ""))

    return " ".join(str(item).lower() for item in parts if item)


def score_categories(text: str, current_category: str | None) -> Counter:
    scores: Counter = Counter()

    if current_category:
        scores[str(current_category)] += 2

    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword in text:
                scores[category] += 1

    if not scores:
        scores["Оборудование"] = 1

    return scores


def resolve_category(scores: Counter, fallback: str | None) -> str:
    if scores:
        return scores.most_common(1)[0][0]

    if fallback:
        return str(fallback)

    return "Оборудование"


def resolve_confidence(rationale: list[str], category_scores: Counter, severity_signals: int) -> str:
    best_category_score = category_scores.most_common(1)[0][1] if category_scores else 0

    if len(rationale) >= 4 or best_category_score >= 4 or severity_signals >= 2:
        return "высокая"

    if len(rationale) >= 2 or best_category_score >= 2:
        return "средняя"

    return "низкая"


def build_next_steps(category: str, ticket: dict, equipment: dict) -> list[str]:
    actions: list[str] = []

    if category == "Сеть":
        actions.extend(
            [
                "Проверить активный uplink, состояние интерфейсов и журналы сетевого оборудования.",
                "Переключить сервис на резервный канал или резервный сетевой модуль при наличии.",
                "Подтвердить стабильность соединения после корректирующих действий.",
            ]
        )
    elif category == "Сервер":
        actions.extend(
            [
                "Проверить журналы резервного копирования, RAID и объём свободного пространства.",
                "Подтвердить целостность последней успешной резервной копии.",
                "Согласовать окно обслуживания, если требуется восстановление сервиса.",
            ]
        )
    elif category == "ПО":
        actions.extend(
            [
                "Провести диагностику системного накопителя, загрузочной записи и последних изменений конфигурации.",
                "Подготовить восстановление рабочего образа или откат к резервной точке.",
                "Проверить корректность запуска после восстановления и задокументировать результат.",
            ]
        )
    elif category == "Периферия":
        actions.extend(
            [
                "Провести первичную аппаратную диагностику узлов подачи и расходных материалов.",
                "Проверить наличие типового дефекта и оценить целесообразность сервисного ремонта.",
                "Подтвердить работу устройства на тестовом задании.",
            ]
        )
    else:
        actions.extend(
            [
                "Выполнить базовую аппаратную диагностику и исключить отказ питания или перегрев.",
                "Проверить наличие повторяемости неисправности по истории обращений.",
                "Зафиксировать результат и принять решение о сервисном обслуживании или замене.",
            ]
        )

    if str(ticket.get("status") or "").lower() == "просрочена":
        actions.append("Эскалировать обращение в приоритетную очередь и назначить контрольный срок исполнения.")

    if int(equipment.get("incidentCount") or 0) >= 2:
        actions.append("Оценить актив как кандидата на внеплановую диагностику или замену.")

    return unique_items(actions, limit=5)


def build_risks(category: str, ticket: dict, equipment: dict, proposed_priority: str) -> list[str]:
    risks: list[str] = []

    if proposed_priority == "критический":
        risks.append("Высокий риск простоя ключевого рабочего процесса.")

    if category in {"Сеть", "Сервер"}:
        risks.append("Возможна деградация связанных сервисов и рост числа зависимых инцидентов.")

    if int(equipment.get("incidentCount") or 0) >= 2:
        risks.append("Повторяемость отказов указывает на системную проблему конкретного актива.")

    if str(ticket.get("status") or "").lower() == "просрочена":
        risks.append("Дальнейшая задержка обработки увеличивает вероятность эскалации и нарушения SLA.")

    if str(equipment.get("status") or "").lower() == "в ремонте":
        risks.append("Техника уже находится в ремонтном контуре, что повышает риск повторного отказа.")

    if not risks:
        risks.append("Сохраняется риск повторного обращения при неполной диагностике первопричины.")

    return unique_items(risks, limit=4)


def build_summary(category: str, priority: str, ticket: dict, equipment: dict) -> str:
    asset_name = equipment.get("name") or "связанная техника"
    return (
        f"{category}: по заявке {ticket.get('id', 'без номера')} выявлены признаки инцидента, "
        f"влияющего на {asset_name}. Рекомендуемый уровень реакции — {priority}."
    )


def build_executive_note(priority: str, category: str, risks: list[str]) -> str:
    risk_phrase = risks[0].rstrip(".") if risks else "сохраняется операционный риск"
    category_label = category if category.isupper() else category.lower()
    return f"Приоритет {priority}; тип инцидента: {category_label}. {risk_phrase}."


def has_any(text: str, words: list[str]) -> bool:
    return any(word in text for word in words)


def unique_items(items: list[str], limit: int) -> list[str]:
    result: list[str] = []

    for item in items:
        cleaned = item.strip()

        if cleaned and cleaned not in result:
            result.append(cleaned)

        if len(result) >= limit:
            break

    return result
