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
  "reasoning": "<internal CoT: 1. Identify site/brand. 2. Compare current snapshot vs last known history. 3. Decide if previous goal is active or if we should re-explore.>",
  "guideTitle": "<max 6 words, current active context>",
  "narrative": "<a friendly, brand-aware greeting and explanation of what to do next>",
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
      "elementSelector": "<CSS selector or null>",
      "elementId": "<the exact 'wgId' from the snapshot or null>",
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
    "You are WebGuide, an elite native situational co-pilot. Your mission is to provide fluid, "
    "brand-aware guidance that feels like a natural extension of the website.\n\n"
    "OPERATIONAL PHASES:\n"
    "1. IDENTITY: Detect the platform purpose (e.g., 'Jiji: Marketplace', 'ChatGPT: AI Workspace'). Adopt its tone.\n"
    "2. DISPLACEMENT: Compare the current page to any previous state in history. Did the user's last action succeed? "
    "Are they closer to their goal?\n"
    "3. GUIDANCE: Output available 'suggestedIntents' for discovery AND 'steps' for specific goals. "
    "Even in Tutorial mode, you can suggest alternative intents if you see something interesting.\n\n"
    "CRITICAL: When generating 'steps', you MUST use the 'wgId' from the snapshot and "
    "put it in the 'elementId' field. This is the only stable way to target elements.\n\n"
    "NARRATIVE GUIDELINES:\n"
    "- EXPLORER: Start with a personal, brand-aware greeting. CASUAL tone.\n"
    "- INTENT-MATCH: If the user says they want to do X, and X exists on the page: You MUST provide a 'step' targeting that element with the correct 'wgId'. Explain it in the 'narrative'.\n"
    "- PROGRESS: Acknowledge navigation: 'I see you're on [Page]. Let's continue with [Action].'\n"
    "- NO TECH-TALK: Avoid robotic headers, list counts, or mentioning 'intents/steps' in the narrative.\n\n"
    "Return a JSON object. Be high-precision and helpful.\n\n"
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

    # Dynamic Context Instruction
    instruction = (
        "Evaluate the current page in the context of the conversation history. "
        "1. If this is a new navigation, explain the new page and the next step towards the goal. "
        "2. If no goal is clear, provide diverse 'suggestedIntents' for discovery. "
        "3. Always use 'wgId' for targeting elements in 'steps'."
    )

    import json
    messages.append({
        "role": "user",
        "content": (
            f"Current page snapshot:\n{json.dumps(snapshot, ensure_ascii=False)}\n\n"
            f"{instruction}"
        )
    })
    return messages
