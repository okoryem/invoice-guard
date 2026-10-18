"""Compare Jev with general LLMs on the same scam-scoring job: speed, cost, and accuracy.

Usage: python3 spike/model_compare.py
Needs TYPESAFE_API_KEY and OPENROUTER_API_KEY in .env. Sends all 53 samples from
requests.json and requests_hard.json to each model, with the same eight yes/no
questions the app asks, and writes every answer to spike/results/.

Every sample was written for this project, so accuracy here is an indication, not proof.
"""

import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LLMS = ["anthropic/claude-haiku-5.5", "anthropic/claude-sonnet-5.5", "openai/gpt-6-luna", "openai/gpt-6.1-sol"]
JEV_MODEL = "jev-1.13.0"
JEV_PRICE_IN = 0.042e-6  # dollars per input token; output is free

# The same questions as src/lib/jev.ts.
QUESTIONS = {
    "is_scam": "Is `invoice` a scam or fraud attempt?",
    "impersonation": "Does `invoice.from_name` or `invoice.note` claim to come from a well-known company, bank, or government agency?",
    "sender_mismatch": "Does the organization or person named in `invoice.from_name` conflict with the address in `invoice.from_email`?",
    "phone_callback": "Does `invoice.note` tell the recipient to call a phone number to cancel, dispute, or get a refund?",
    "pressure": "Does `invoice.note` threaten consequences or pressure the recipient to act quickly?",
    "unordered_charge": "Does `invoice.note` describe a purchase, renewal, or charge that the recipient is told they may not have authorized?",
    "advance_fee": "Does `invoice.note` ask the recipient to pay a fee or send money back in order to receive a larger amount later?",
    "off_platform": "Does `invoice.note` steer the recipient toward a link, changed payment details, or secrecy?",
}

LLM_SYSTEM = (
    "You score invoices for an automated payment system. For each question, give the probability "
    "from 0 to 1 that the answer is yes. Reply with only a JSON object mapping each question id to "
    "its probability, with no other text."
)


def load_env():
    env = {}
    for line in (ROOT / ".env").read_text().splitlines():
        name, sep, value = line.partition("=")
        if sep and not name.strip().startswith("#"):
            env[name.strip()] = value.strip().strip("\"'")
    return env


def post(url, headers, body, timeout=90):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={**headers, "Content-Type": "application/json"})
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.load(resp)
        return data, (time.perf_counter() - started) * 1000, None
    except urllib.error.HTTPError as err:
        return None, (time.perf_counter() - started) * 1000, f"HTTP {err.code}: {err.read().decode()[:200]}"
    except Exception as err:  # timeouts and connection errors count as failures, not crashes
        return None, (time.perf_counter() - started) * 1000, str(err)[:200]


def state_for(sample):
    return {"invoice": {
        "from_name": sample["from_name"],
        "from_email": sample["from_email"],
        "amount": sample["amount"],
        "currency": sample["currency"],
        "note": sample["note"],
    }}


def ask_jev(env, sample):
    body = {
        "model": JEV_MODEL,
        "state": state_for(sample),
        "questions": {qid: {"type": "noul", "instructions": text} for qid, text in QUESTIONS.items()},
    }
    data, ms, error = post("https://api.typesafe.ai/v1/systemone", {"Authorization": f"Bearer {env['TYPESAFE_API_KEY']}"}, body)
    if error:
        return {"error": error, "ms": ms}
    tokens = data.get("usage", {}).get("input_tokens", 0)
    return {"answers": {k: v["noul"] for k, v in data["answers"].items()}, "ms": ms, "cost": tokens * JEV_PRICE_IN}


def ask_llm(env, model, sample):
    questions = "\n".join(f"- {qid}: {text}" for qid, text in QUESTIONS.items())
    body = {
        "model": model,
        "temperature": 0,
        "max_tokens": 1200,
        "usage": {"include": True},
        "messages": [
            {"role": "system", "content": LLM_SYSTEM},
            {"role": "user", "content": f"State:\n{json.dumps(state_for(sample))}\n\nQuestions:\n{questions}"},
        ],
    }
    data, ms, error = post("https://openrouter.ai/api/v1/chat/completions", {"Authorization": f"Bearer {env['OPENROUTER_API_KEY']}"}, body)
    if error:
        return {"error": error, "ms": ms}
    usage = data.get("usage", {})
    text = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    result = {"ms": ms, "cost": usage.get("cost"), "raw": text[:400]}
    # Models wrap JSON in code fences or add words; take the outermost braces.
    try:
        parsed = json.loads(text[text.index("{"): text.rindex("}") + 1])
        result["answers"] = {qid: float(parsed[qid]) for qid in QUESTIONS}
    except (ValueError, KeyError, TypeError):
        result["error"] = "unreadable answer"
    return result


def summarize(name, samples, results):
    ok = [(s, r) for s, r in zip(samples, results) if "answers" in r]
    times = sorted(r["ms"] for r in results if "error" not in r or r.get("answers"))
    right = sum((r["answers"]["is_scam"] > 0.5) == s["scam"] for s, r in ok)
    false_alarms = sum(r["answers"]["is_scam"] > 0.5 and not s["scam"] for s, r in ok)
    missed = sum(r["answers"]["is_scam"] <= 0.5 and s["scam"] for s, r in ok)
    unsure = sum(0.2 < r["answers"]["is_scam"] < 0.8 for _, r in ok)
    costs = [r["cost"] for r in results if r.get("cost") is not None]
    return {
        "model": name,
        "answered": f"{len(ok)}/{len(samples)}",
        "correct": f"{right}/{len(ok)}",
        "missed_scams": missed,
        "false_alarms": false_alarms,
        "unsure": unsure,
        "median_ms": round(statistics.median(times)) if times else None,
        "p90_ms": round(times[int(len(times) * 0.9) - 1]) if times else None,
        "cost_per_1000": round(sum(costs) / len(costs) * 1000, 3) if costs else None,
    }


def main():
    env = load_env()
    for key in ("TYPESAFE_API_KEY", "OPENROUTER_API_KEY"):
        if not env.get(key):
            sys.exit(f"{key} is not set in .env")
    samples = json.loads((ROOT / "spike" / "requests.json").read_text()) + json.loads((ROOT / "spike" / "requests_hard.json").read_text())

    runs = {"jev": lambda s: ask_jev(env, s)}
    for model in LLMS:
        runs[model] = lambda s, m=model: ask_llm(env, m, s)

    out_dir = ROOT / "spike" / "results"
    out_dir.mkdir(exist_ok=True)
    rows = []
    for name, ask in runs.items():
        # A few calls at a time; each call is still timed on its own.
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(ask, samples))
        rows.append(summarize(name, samples, results))
        (out_dir / f"{name.replace('/', '_')}.json").write_text(
            json.dumps([{"id": s["id"], "scam": s["scam"], **r} for s, r in zip(samples, results)], indent=1)
        )
        print(f"done: {name}", file=sys.stderr)

    cols = ["model", "answered", "correct", "missed_scams", "false_alarms", "unsure", "median_ms", "p90_ms", "cost_per_1000"]
    print("  ".join(c.ljust(28 if c == "model" else 12) for c in cols))
    for row in rows:
        print("  ".join(str(row[c]).ljust(28 if c == "model" else 12) for c in cols))
    (out_dir / "summary.json").write_text(json.dumps(rows, indent=1))


if __name__ == "__main__":
    main()
