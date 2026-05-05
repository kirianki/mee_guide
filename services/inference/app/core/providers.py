"""
Provider abstraction layer — OpenAI primary, Anthropic fallback.

Model mapping by tier:
  lightweight → gpt-4o-mini         / claude-haiku-4-5
  standard    → gpt-4o              / claude-sonnet-4-6
  heavy       → gpt-4o (high ctx)   / claude-opus-4-6

Two-pass inference: streaming Reasoning → structured JSON Synthesis.
Falls back to Anthropic if both OpenAI attempts fail.
"""

import asyncio
import json
import logging
import time
from typing import AsyncGenerator

from anthropic import AsyncAnthropic
from openai import AsyncOpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── Clients ──────────────────────────────────────────────────────────────────

openai_client    = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
anthropic_client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

# ─── Model registry ───────────────────────────────────────────────────────────

OPENAI_MODELS: dict[str, str] = {
    "lightweight": "gpt-4o-mini",
    "standard":    "gpt-4o",
    "heavy":       "gpt-4o",
}

ANTHROPIC_MODELS: dict[str, str] = {
    "lightweight": "claude-haiku-4-5-20251001",
    "standard":    "claude-sonnet-4-6",
    "heavy":       "claude-opus-4-6",
}

VALID_TIERS = frozenset(OPENAI_MODELS)

# Token budgets per pass
REASONING_MAX_TOKENS  = 2048   # plain-text CoT — needs room to explore
SYNTHESIS_MAX_TOKENS  = 2048   # full JSON schema output

# ─── Prompts ──────────────────────────────────────────────────────────────────

OUTPUT_SCHEMA = """
Respond ONLY with valid JSON matching this exact schema (no markdown, no explanation):
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
      "elementSelector": "<exact structural CSS selector, never null>",
      "elementId": "<the exact wgId from the snapshot or null>",
      "completionTrigger": "<click|input|navigation|publisher_signal|manual>",
      "completionSelector": "<CSS selector that triggers completion or null>"
    }
  ],
  "errorDetected": "<max 15 words or null>",
  "confidence": 0.0
}
"""

SYSTEM_PROMPT = (
    "You are WebGuide, an elite natural language situational co-pilot for the web.\n\n"
    "OPERATIONAL PHASES:\n"
    "1. SCAN & DISCOVER: Review the `pageMarkdown` DOM snapshot carefully. The initial scan dictates EVERYTHING "
    "the user can do. ABSOLUTE RULE: Do NOT hallucinate features based on outside knowledge. However, you MUST "
    "be consistent with your internal reasoning pass. If you identified an element (like a filter or search bar) "
    "in your thoughts, you MUST include it in the final JSON.\n"
    "2. TUTORIAL GUIDANCE: When responding to a goal, your `narrative` MUST be a fluid, natural language tutorial. "
    "Speak conversationally (e.g., 'To start a chat, click the new chat icon right here.').\n"
    "3. TARGETING: Strictly map your tutorial to the `steps` array by grabbing the exact wg-id from the markup.\n\n"
    "NARRATIVE GUIDELINES:\n"
    "- ALWAYS use natural, friendly narrative.\n"
    "- ZERO TECH-TALK: Never mention 'DOM', 'wgId', or 'snapshot' to the user.\n"
    "- STRICT CONSISTENCY: Your JSON output must perfectly reflect your internal reasoning pass findings.\n\n"
    + OUTPUT_SCHEMA
)

REASONING_PROMPT = (
    "You are the internal reasoning engine for WebGuide. Analyze the `pageMarkdown` DOM snapshot and "
    "conversational history.\n"
    "1. Identify the site/brand and its current state. Look specifically for search bars, filters, sorting "
    "options, and navigation menus.\n"
    "2. Determine exactly what the user is trying to accomplish.\n"
    "3. Map their goal to exact wg-ids. In the markdown, interactive elements look like "
    "`[Role: Description](wg-id)`. Pay close attention to 'Input', 'Select', and 'Button' roles that mention "
    "'Search', 'Filter', 'Location', or 'Apply'.\n"
    "4. Draft a step-by-step UI plan.\n"
    "Output your internal thoughts in plain text. Explicitly list the wg-ids you will use for each step."
)

# ─── Required output schema fields for validation ─────────────────────────────

_REQUIRED_TOP_LEVEL = {"guideTitle", "narrative", "suggestedIntents", "steps", "confidence"}
_REQUIRED_STEP      = {"stepIndex", "instruction", "elementSelector", "completionTrigger"}
_REQUIRED_INTENT    = {"id", "title", "confidence"}


def _validate_output(data: dict) -> list[str]:
    """
    Returns a list of validation error strings.
    Empty list means the output is acceptable.
    """
    errors: list[str] = []

    missing_top = _REQUIRED_TOP_LEVEL - data.keys()
    if missing_top:
        errors.append(f"Missing top-level keys: {missing_top}")

    if not isinstance(data.get("steps"), list):
        errors.append("'steps' must be a list")
    else:
        for i, step in enumerate(data["steps"]):
            missing = _REQUIRED_STEP - step.keys()
            if missing:
                errors.append(f"Step {i} missing keys: {missing}")

    if not isinstance(data.get("suggestedIntents"), list):
        errors.append("'suggestedIntents' must be a list")
    else:
        for i, intent in enumerate(data["suggestedIntents"]):
            missing = _REQUIRED_INTENT - intent.keys()
            if missing:
                errors.append(f"Intent {i} missing keys: {missing}")

    conf = data.get("confidence")
    if not isinstance(conf, (int, float)) or not (0.0 <= conf <= 1.0):
        errors.append(f"'confidence' must be a float in [0, 1], got: {conf!r}")

    return errors


# ─── Message builders ─────────────────────────────────────────────────────────

def _build_reasoning_messages(
    snapshot: dict,
    history: list[dict],
    grounding: str | None,
) -> list[dict]:
    messages: list[dict] = [{"role": "system", "content": REASONING_PROMPT}]

    if grounding:
        messages.append({"role": "user",      "content": f"[GROUNDING CONTEXT]\n{grounding}\n[END GROUNDING]"})
        messages.append({"role": "assistant", "content": "Understood. I have the grounding context."})

    # Rolling 6-turn window (6 turns × 2 messages = 12 items)
    messages.extend(history[-12:])

    messages.append({
        "role": "user",
        "content": (
            f"Current page snapshot:\n{json.dumps(snapshot, ensure_ascii=False)}\n\n"
            "Analyze the DOM and history. Output your thought process and map the required wg-ids before synthesizing."
        ),
    })
    return messages


def _build_synthesis_messages(
    snapshot: dict,
    history: list[dict],
    grounding: str | None,
    reasoning_text: str,
) -> list[dict]:
    """
    Assembles: system → grounding → history → reasoning injection → snapshot.
    The reasoning is inserted as a committed assistant turn BEFORE the final
    user snapshot message, making the injection position explicit rather than
    relying on list.insert(-1, ...).
    """
    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]

    if grounding:
        messages.append({"role": "user",      "content": f"[GROUNDING CONTEXT]\n{grounding}\n[END GROUNDING]"})
        messages.append({"role": "assistant", "content": "Understood. I have the grounding context."})

    messages.extend(history[-12:])

    # Inject reasoning as a committed assistant prefill before the snapshot
    messages.append({
        "role": "assistant",
        "content": f"My internal reasoning and wg-id map:\n{reasoning_text}\n\nI will now convert this into the exact JSON schema.",
    })

    messages.append({
        "role": "user",
        "content": (
            f"Current page snapshot:\n{json.dumps(snapshot, ensure_ascii=False)}\n\n"
            "Evaluate the current page strictly using the pageMarkdown snapshot. "
            "1. If this is a new scan, analyze what the user can do ONLY based on visible elements, "
            "and list true capabilities in 'suggestedIntents'. "
            "2. If the user elected an option or asked a question, write a natural language tutorial "
            "in 'narrative' explaining exactly what to do using conversational 'click here' references. "
            "3. Provide exactly ONE step object per required interaction, targeting the explicit wg-id."
        ),
    })
    return messages


# ─── OpenAI helpers ───────────────────────────────────────────────────────────

async def _call_openai_stream(messages: list[dict], tier: str) -> AsyncGenerator[str, None]:
    model    = OPENAI_MODELS[tier]
    response = await openai_client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=REASONING_MAX_TOKENS,
        temperature=0.2,
        stream=True,
    )
    async for chunk in response:
        content = chunk.choices[0].delta.content
        if content:
            yield content


async def _call_openai(messages: list[dict], tier: str) -> dict:
    model    = OPENAI_MODELS[tier]
    response = await openai_client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=SYNTHESIS_MAX_TOKENS,
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    return json.loads(response.choices[0].message.content)


# ─── Anthropic helpers ────────────────────────────────────────────────────────

async def _call_anthropic_stream(messages: list[dict], tier: str) -> AsyncGenerator[str, None]:
    """Stream the reasoning pass via Anthropic."""
    model = ANTHROPIC_MODELS[tier]
    # Anthropic requires system prompt as a top-level param; strip it from messages
    system  = next((m["content"] for m in messages if m["role"] == "system"), "")
    history = [m for m in messages if m["role"] != "system"]

    async with anthropic_client.messages.stream(
        model=model,
        system=system,
        messages=history,
        max_tokens=REASONING_MAX_TOKENS,
    ) as stream:
        async for text in stream.text_stream:
            yield text


async def _call_anthropic(messages: list[dict], tier: str) -> dict:
    """
    Synthesis pass via Anthropic.
    Instructs the model to respond with JSON only via the system prompt — Anthropic
    does not support a `response_format` parameter the same way OpenAI does.
    """
    model  = ANTHROPIC_MODELS[tier]
    system = next((m["content"] for m in messages if m["role"] == "system"), "")
    # Append a hard JSON-only instruction so the model doesn't wrap output in prose
    system += "\n\nCRITICAL: Your response must be a single valid JSON object. No prose, no markdown fences."
    history = [m for m in messages if m["role"] != "system"]

    response = await anthropic_client.messages.create(
        model=model,
        system=system,
        messages=history,
        max_tokens=SYNTHESIS_MAX_TOKENS,
    )
    raw = response.content[0].text.strip()
    # Strip any accidental markdown fences the model may still emit
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


# ─── Main inference pipeline ──────────────────────────────────────────────────

async def run_inference_stream(
    snapshot: dict,
    conversation_history: list[dict],
    grounding_context: str | None = None,
    tier: str = "standard",
) -> AsyncGenerator[str, None]:
    """
    Two-pass inference: streaming Reasoning → structured JSON Synthesis.

    Yields newline-delimited JSON lines:
      {"type": "thought",  "content": "<reasoning chunk>"}
      {"type": "result",   "content": {…}, "provider": "openai"|"anthropic"}
      {"type": "error",    "content": "<message>"}

    Falls back to Anthropic if both OpenAI attempts fail.
    Raises ValueError for invalid tier; RuntimeError if all providers fail.
    """
    if tier not in VALID_TIERS:
        raise ValueError(f"Invalid tier {tier!r}. Must be one of: {sorted(VALID_TIERS)}")

    reasoning_messages = _build_reasoning_messages(snapshot, conversation_history, grounding_context)

    # ── Two-pass OpenAI attempts ───────────────────────────────────────────────
    last_error: Exception | None = None

    for attempt in range(2):
        try:
            t0 = time.monotonic()
            logger.info("[Inference] Reasoning pass — attempt %d (OpenAI)", attempt + 1)
            reasoning_text = ""

            async for chunk in _call_openai_stream(reasoning_messages, tier):
                reasoning_text += chunk
                yield json.dumps({"type": "thought", "content": chunk}) + "\n"

            logger.info("[Inference] Reasoning done in %.2fs", time.monotonic() - t0)

            synthesis_messages = _build_synthesis_messages(
                snapshot, conversation_history, grounding_context, reasoning_text
            )

            t1 = time.monotonic()
            logger.info("[Inference] Synthesis pass (OpenAI)")
            result = await asyncio.wait_for(_call_openai(synthesis_messages, tier), timeout=60.0)
            logger.info("[Inference] Synthesis done in %.2fs", time.monotonic() - t1)

            errors = _validate_output(result)
            if errors:
                logger.warning("[Inference] Schema validation warnings: %s", errors)

            yield json.dumps({"type": "result", "content": result, "provider": "openai"}) + "\n"
            return

        except asyncio.TimeoutError as e:
            last_error = e
            logger.warning("[Inference] OpenAI attempt %d timed out", attempt + 1)
            if attempt == 0:
                await asyncio.sleep(1.5)   # brief pause before retry
        except Exception as e:
            last_error = e
            logger.warning("[Inference] OpenAI attempt %d failed (%s): %s", attempt + 1, type(e).__name__, e)
            if attempt == 0:
                await asyncio.sleep(1.5)

    # ── Anthropic fallback ─────────────────────────────────────────────────────
    logger.warning("[Inference] OpenAI exhausted — falling back to Anthropic (%s)", ANTHROPIC_MODELS[tier])
    try:
        t0 = time.monotonic()
        reasoning_text = ""

        async for chunk in _call_anthropic_stream(reasoning_messages, tier):
            reasoning_text += chunk
            yield json.dumps({"type": "thought", "content": chunk}) + "\n"

        logger.info("[Inference] Anthropic reasoning done in %.2fs", time.monotonic() - t0)

        synthesis_messages = _build_synthesis_messages(
            snapshot, conversation_history, grounding_context, reasoning_text
        )

        t1 = time.monotonic()
        result = await asyncio.wait_for(_call_anthropic(synthesis_messages, tier), timeout=60.0)
        logger.info("[Inference] Anthropic synthesis done in %.2fs", time.monotonic() - t1)

        errors = _validate_output(result)
        if errors:
            logger.warning("[Inference] Anthropic schema validation warnings: %s", errors)

        yield json.dumps({"type": "result", "content": result, "provider": "anthropic"}) + "\n"
        return

    except Exception as e:
        logger.error("[Inference] Anthropic fallback failed (%s): %s", type(e).__name__, e)
        yield json.dumps({"type": "error", "content": f"All providers failed. Last error: {e}"}) + "\n"
        raise RuntimeError(f"All inference providers failed. Original OpenAI error: {last_error}") from e
