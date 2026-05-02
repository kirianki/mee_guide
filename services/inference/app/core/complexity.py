"""
Complexity scorer — classifies an incoming snapshot into a model tier.
Score 0–3  → lightweight (gpt-4o-mini / claude-haiku-3-5)
Score 4–6  → standard   (gpt-4o / claude-sonnet-4)
Score 7–10 → heavy      (gpt-4o long / claude-opus-4)
"""


def score_complexity(snapshot: dict, conversation_turns: int) -> int:
    score = 0

    # Form field count (0-2)
    field_count = len(snapshot.get("formFields", []))
    if field_count >= 9:
        score += 2
    elif field_count >= 4:
        score += 1

    # Alerts/errors present (0-2)
    alert_count = len(snapshot.get("alerts", []))
    if alert_count >= 2:
        score += 2
    elif alert_count >= 1:
        score += 1

    # Snapshot size proxy: number of headings + buttons (0-2)
    element_count = len(snapshot.get("headings", [])) + len(snapshot.get("buttons", []))
    if element_count > 20:
        score += 2
    elif element_count > 10:
        score += 1

    # URL depth (0-2)
    path = snapshot.get("urlPath", "")
    depth = len([s for s in path.split("/") if s])
    if depth >= 5:
        score += 2
    elif depth >= 3:
        score += 1

    # Conversation turn count (0-2)
    if conversation_turns >= 5:
        score += 2
    elif conversation_turns >= 2:
        score += 1

    return min(score, 10)


def get_model_tier(score: int) -> str:
    if score <= 3:
        return "lightweight"
    elif score <= 6:
        return "standard"
    return "heavy"
