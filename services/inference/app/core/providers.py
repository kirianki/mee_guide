"""
Provider abstraction layer — OpenAI primary, Anthropic fallback.

Model mapping by tier:
  lightweight → gpt-4o-mini         / claude-haiku-3-5
  standard    → gpt-4o              / claude-sonnet-4
  heavy       → gpt-4o (high ctx)   / claude-opus-4
"""
import asyncio
import logging
from openai import AsyncOpenAI
from anthropic import AsyncAnthropic
from app.core.config import settings

logger = logging.getLogger(__name__)

openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
anthropic_client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

OPENAI_MODELS = {
    "lightweight": "gpt-4o-mini",
    "standard":    "gpt-4o",
    "heavy":       "gpt-4o",
}

ANTHROPIC_MODELS = {
    "lightweight": "claude-haiku-3-5-20241022",
    "standard":    "claude-sonnet-4-5",
    "heavy":       "claude-opus-4-5",
}

# Locked output schema prompt appended to every system prompt
OUTPUT_SCHEMA = """
Respond ONLY with valid JSON matching this exact schema:
{
  "guideTitle": "<max 6 words, current active guide>",
  "suggestedIntents": [
    {
      "id": "<kebab-case-id>",
      "title": "<user goal, e.g. 'Sell an Item'>",
      "description": "<max 10 words>",
      "confidence": 0.0
    }
  ],
  "steps": [
    {
      "stepIndex": 0,
      "instruction": "<imperative verb, max 18 words>",
      "tooltipText": "<max 12 words or null>",
      "elementSelector": "<specific CSS selector to highlight or null>",
      "completionTrigger": "<click|input|navigation|publisher_signal|manual>",
      "completionSelector": "<CSS selector that triggers completion or null>"
    }
  ],
  "errorDetected": "<max 15 words or null>",
  "confidence": 0.0
}
No markdown, no explanation, only the JSON object.
"""

SYSTEM_PROMPT = (
    "You are WebGuide, an elite situational navigation co-pilot. Your mission is to analyze "
    "the current browser page snapshot and provide a set of 'Navigation Options' — branching "
    "choices that help the user achieve their goals. These are NOT linear steps; they "
    "are available actions for the current page state. Each option should guide the user "
    "to the next meaningful interaction.\n\n"
    "Return a JSON object where 'guideTitle' describes the overall page purpose, "
    "and 'steps' is an array of discovered 'options' (intentions) available to the user. "
    "Include ALL categories, workflows, and user goals you detect — "
    "be exhaustive. For each option, provide an accurate 'elementSelector' CSS selector "
    "so the UI can visually highlight the exact element (button, link, input) the user "
    "must interact with. IMPORTANT: Use ONLY standard CSS selectors. DO NOT use ':contains()' "
    "or ':text()' pseudo-selectors as they are not valid in standard querySelector. "
    "Be direct, concise, and action-oriented.\n\n"
    + OUTPUT_SCHEMA
)


async def run_inference(
    snapshot: dict,
    conversation_history: list[dict],
    grounding_context: str | None = None,
    tier: str = "standard",
) -> tuple[dict, str]:
    """
    Run inference. Returns (parsed_response_dict, provider_name).
    Tries OpenAI (2 attempts).
    """
    messages = _build_messages(snapshot, conversation_history, grounding_context)

    # Primary: OpenAI — 2 attempts with 30s timeout each
    for attempt in range(2):
        try:
            result = await asyncio.wait_for(
                _call_openai(messages, tier), timeout=30.0
            )
            return result, "openai"
        except Exception as e:
            logger.warning(f"OpenAI attempt {attempt + 1} failed ({type(e).__name__}): {e}")

    raise RuntimeError("OpenAI inference failed after retry")


async def _call_openai(messages: list[dict], tier: str) -> dict:
    import json
    model = OPENAI_MODELS[tier]
    response = await openai_client.chat.completions.create(
        model=model,
        messages=messages,
        response_format={"type": "json_object"},
        max_tokens=1024,
        temperature=0.2,
    )
    return json.loads(response.choices[0].message.content)


def _build_messages(
    snapshot: dict,
    history: list[dict],
    grounding: str | None,
) -> list[dict]:
    """Assemble the message array: system → grounding → history → current snapshot."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    if grounding:
        messages.append({
            "role": "user",
            "content": f"[GROUNDING CONTEXT]\n{grounding}\n[END GROUNDING]"
        })
        messages.append({"role": "assistant", "content": "Understood, I have the grounding context."})

    # Conversation history (rolling 6-turn window)
    messages.extend(history[-12:])  # 6 turns × 2 (user+assistant)

    # Current snapshot (delta if continued session, full if first turn)
    import json
    messages.append({
        "role": "user",
        "content": (
            f"Current page snapshot:\n{json.dumps(snapshot, ensure_ascii=False)}\n\n"
            "Produce step-by-step guidance for this page."
        )
    })
    return messages
