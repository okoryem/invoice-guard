"""Smoke test: can Jev tell scam money requests from legitimate ones?

Usage: python3 spike/jev_scam_test.py [samples.json]
Defaults to spike/requests.json. A sample with a "base" id is a copy of that
sample from requests.json with text added to sway the model; the shift is reported.
Reads TYPESAFE_API_KEY from the environment or from .env in the project root.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API_URL = "https://api.typesafe.ai/v1/systemone"
MODEL = "jev-1.13.0"  # pinned so thresholds don't drift when the alias moves

# One atomic question per red flag, plus an overall judgment to compare against.
QUESTIONS = {
    "is_scam": "Is `money_request` a scam or fraud attempt?",
    "impersonation": "Does `money_request.from_name` or `money_request.note` claim to come from a well-known company, bank, or government agency?",
    "sender_mismatch": "Does the organization or person named in `money_request.from_name` conflict with the address in `money_request.from_email`?",
    "phone_callback": "Does `money_request.note` tell the recipient to call a phone number to cancel, dispute, or get a refund?",
    "pressure": "Does `money_request.note` threaten consequences or pressure the recipient to act quickly?",
    "unordered_charge": "Does `money_request.note` describe a purchase, renewal, or charge that the recipient is told they may not have authorized?",
    "advance_fee": "Does `money_request.note` ask the recipient to pay a fee or send money back in order to receive a larger amount later?",
    "off_platform": "Does `money_request.note` steer the recipient toward a link, changed payment details, or secrecy?",
}
FLAGS = [q for q in QUESTIONS if q != "is_scam"]


def load_key():
    key = os.environ.get("TYPESAFE_API_KEY")
    env_file = ROOT / ".env"
    if not key and env_file.exists():
        for line in env_file.read_text().splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "TYPESAFE_API_KEY":
                key = value.strip().strip("\"'")
    if not key:
        sys.exit("TYPESAFE_API_KEY is not set. Add it to .env (see .env.example).")
    return key


def ask_jev(key, request):
    state = {k: v for k, v in request.items() if k not in ("id", "scam", "kind", "base")}
    body = {
        "model": MODEL,
        "state": {"money_request": state},
        "questions": {qid: {"type": "noul", "instructions": text} for qid, text in QUESTIONS.items()},
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    for attempt in range(4):
        started = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.load(resp)
            break
        except urllib.error.HTTPError as err:
            # 429 rate limit and 529 overloaded are retryable per the API reference
            if err.code in (429, 529) and attempt < 3:
                time.sleep(2 ** attempt)
                continue
            sys.exit(f"API error {err.code}: {err.read().decode()[:500]}")
    elapsed_ms = (time.perf_counter() - started) * 1000
    return {qid: a["noul"] for qid, a in data["answers"].items()}, elapsed_ms, data.get("usage", {})


def main():
    key = load_key()
    samples = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "spike" / "requests.json"
    requests = json.loads(samples.read_text())
    originals = {r["id"]: r for r in json.loads((ROOT / "spike" / "requests.json").read_text())}

    rows, tokens = [], 0
    for request in requests:
        answers, ms, usage = ask_jev(key, request)
        tokens += usage.get("input_tokens", 0)
        rows.append((request, answers, ms))

    print(f"{'id':<5}{'kind':<20}{'truth':<7}{'is_scam':>8}{'flags':>7}{'ms':>7}  top flags")
    correct_direct = correct_flags = unsure = 0
    by_kind = {}
    for request, answers, ms in rows:
        direct = answers["is_scam"]
        fired = [f for f in FLAGS if answers[f] > 0.8]
        right = (direct > 0.5) == request["scam"]
        correct_direct += right
        correct_flags += (len(fired) >= 2) == request["scam"]
        unsure += 0.2 < direct < 0.8
        kind = request.get("kind", "")
        tally = by_kind.setdefault(kind, [0, 0, 0])
        tally[0] += right
        tally[1] += 0.2 < direct < 0.8
        tally[2] += 1
        truth = "scam" if request["scam"] else "legit"
        print(f"{request['id']:<5}{kind:<20}{truth:<7}{direct:>8.2f}{len(fired):>7}{ms:>7.0f}  {', '.join(fired)}")

    swayed = [(r, a) for r, a, _ in rows if r.get("base") in originals]
    if swayed:
        print()
        print("Effect of text added to sway the model (is_scam before -> after):")
        for request, answers in swayed:
            before, _, usage = ask_jev(key, originals[request["base"]])
            tokens += usage.get("input_tokens", 0)
            print(f"  {request['base']} -> {request['id']}: {before['is_scam']:.2f} -> {answers['is_scam']:.2f}  ({answers['is_scam'] - before['is_scam']:+.2f})")

    n = len(rows)
    latencies = sorted(ms for _, _, ms in rows)
    print()
    if len(by_kind) > 1:
        for kind, (right, unsure_k, total) in by_kind.items():
            print(f"{kind:<27}{right}/{total} correct, {unsure_k} unsure")
        print()
    print(f"Direct is_scam > 0.5:      {correct_direct}/{n} correct")
    print(f"Two or more flags > 0.8:   {correct_flags}/{n} correct")
    print(f"Uncertain (0.2-0.8):       {unsure}/{n} would go to an LLM or a person")
    print(f"Median latency:            {latencies[n // 2]:.0f} ms")
    print(f"Input tokens:              {tokens}")


if __name__ == "__main__":
    main()
