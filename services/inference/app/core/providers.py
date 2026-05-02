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
      "id": "intent-id-1",
      "title": "<objective, e.g. 'Sell an Item'>",
      "description": "<max 10 words>"
    }
  ],
  "steps": [
    {
      "stepIndex": 0,
      "instruction": "<imperative verb, max 18 words>",
      "tooltipText": "<max 12 words or null>",
      "elementSelector": "<CSS selector or null>",
      "completionTrigger": "<click|input|navigation|publisher_signal|manual>",
      "completionSelector": "<CSS selector or null>"
    }
  ],
  "errorDetected": "<max 15 words or null>",
  "confidence": 0.0
}
No markdown, no explanation, only the JSON object.
"""

SYSTEM_PROMPT = (
    "You are WebGuide, an AI assistant that reads a sanitised DOM snapshot "
    "and produces step-by-step navigation guidance for the user. "
    "Identify up to 3 most likely user objectives as 'suggestedIntents'. "
    "Be direct, concise, and helpful. Never ask clarifying questions.\n\n"
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
    Tries OpenAI first; falls back to Anthropic on 5xx, rate limit, or 4s timeout.
    """
    messages = _build_messages(snapshot, conversation_history, grounding_context)

    # Primary: OpenAI
    try:
        result = await asyncio.wait_for(
            _call_openai(messages, tier), timeout=15.0
        )
        return result, "openai"
    except Exception as e:
        logger.warning(f"OpenAI failed ({type(e).__name__}): {e} — falling back to Anthropic")

    # Fallback: Anthropic
    try:
        result = await asyncio.wait_for(
            _call_anthropic(messages, tier), timeout=8.0
        )
        return result, "anthropic"
    except Exception as e:
        logger.error(f"Anthropic also failed ({type(e).__name__}): {e}")
        raise RuntimeError("Both AI providers failed") from e


async def _call_openai(messages: list[dict], tier: str) -> dict:
    import json
    model = OPENAI_MODELS[tier]
    response = await openai_client.chat.completions.create(
        model=model,
        messages=messages,
        response_format={"type": "json_object"},
        max_tokens=512,
        temperature=0.2,
    )
    return json.loads(response.choices[0].message.content)


async def _call_anthropic(messages: list[dict], tier: str) -> dict:
    import json
    # Anthropic uses a separate system param
    system_msg = messages[0]["content"] if messages[0]["role"] == "system" else SYSTEM_PROMPT
    user_messages = [m for m in messages if m["role"] != "system"]

    model = ANTHROPIC_MODELS[tier]
    response = await anthropic_client.messages.create(
        model=model,
        system=system_msg,
        messages=user_messages,
        max_tokens=512,
    )
    return json.loads(response.content[0].text)


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
