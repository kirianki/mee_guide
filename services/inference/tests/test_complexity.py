"""
Unit tests for the inference complexity scorer.
Pure Python — zero I/O, no mocks needed.
"""
import pytest
from app.core.complexity import score_complexity, get_model_tier

# ... (rest of the file)

def test_empty_snapshot_score_is_zero():
    assert score_complexity({}, 0) == 0


def test_many_form_fields_adds_two():
    snapshot = {"formFields": [{}] * 9}
    assert score_complexity(snapshot, 0) >= 2


def test_few_form_fields_adds_one():
    snapshot = {"formFields": [{}] * 5}
    score = score_complexity(snapshot, 0)
    assert score == 1


def test_one_form_field_adds_nothing():
    snapshot = {"formFields": [{}]}
    assert score_complexity(snapshot, 0) == 0


def test_two_alerts_add_two():
    snapshot = {"alerts": ["err1", "err2"]}
    assert score_complexity(snapshot, 0) >= 2


def test_one_alert_adds_one():
    snapshot = {"alerts": ["err1"]}
    assert score_complexity(snapshot, 0) == 1


def test_many_elements_adds_two():
    # >20 combined headings + buttons
    snapshot = {"headings": ["h"] * 11, "buttons": ["b"] * 11}
    assert score_complexity(snapshot, 0) >= 2


def test_moderate_elements_adds_one():
    # 11 total (>10)
    snapshot = {"headings": ["h"] * 6, "buttons": ["b"] * 5}
    assert score_complexity(snapshot, 0) >= 1


def test_url_depth_3_adds_one():
    snapshot = {"urlPath": "/a/b/c"}
    assert score_complexity(snapshot, 0) == 1


def test_url_depth_5_adds_two():
    snapshot = {"urlPath": "/a/b/c/d/e"}
    assert score_complexity(snapshot, 0) >= 2


def test_five_conversation_turns_adds_two():
    assert score_complexity({}, 5) == 2


def test_two_conversation_turns_adds_one():
    assert score_complexity({}, 2) == 1


def test_score_capped_at_10():
    snapshot = {
        "formFields": [{}] * 15,
        "alerts": ["e"] * 5,
        "headings": ["h"] * 20,
        "buttons": ["b"] * 20,
        "urlPath": "/a/b/c/d/e/f",
    }
    assert score_complexity(snapshot, 10) == 10


# ── get_model_tier ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("score", [0, 1, 2, 3])
def test_tier_lightweight(score):
    assert get_model_tier(score) == "lightweight"


@pytest.mark.parametrize("score", [4, 5, 6])
def test_tier_standard(score):
    assert get_model_tier(score) == "standard"


@pytest.mark.parametrize("score", [7, 8, 9, 10])
def test_tier_heavy(score):
    assert get_model_tier(score) == "heavy"
