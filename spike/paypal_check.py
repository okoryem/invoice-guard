"""Check what the PayPal sandbox lets one app do: token, history, invoices.

Usage: python3 spike/paypal_check.py
Reads PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET from .env in the project root.
The invoice it creates is sent with send_to_recipient=false, so no email goes out.
"""

import base64
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://api-m.sandbox.paypal.com"


def load_env():
    env = {}
    for line in (ROOT / ".env").read_text().splitlines():
        name, sep, value = line.partition("=")
        if sep and not name.strip().startswith("#"):
            env[name.strip()] = value.strip().strip("\"'")
    return env


def call(method, path, token=None, body=None, basic=None, form=None):
    headers = {"Accept": "application/json"}
    data = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if basic:
        headers["Authorization"] = "Basic " + base64.b64encode(basic.encode()).decode()
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "return=representation"
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        raw = err.read().decode()
        try:
            return err.code, json.loads(raw)
        except ValueError:
            return err.code, {"raw": raw[:300]}


def main():
    env = load_env()
    client_id, secret = env.get("PAYPAL_CLIENT_ID"), env.get("PAYPAL_CLIENT_SECRET")
    if not client_id or not secret:
        sys.exit("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set in .env")

    status, auth = call("POST", "/v1/oauth2/token", basic=f"{client_id}:{secret}", form={"grant_type": "client_credentials"})
    print(f"1. Token: HTTP {status}")
    if status != 200:
        sys.exit(f"   {auth.get('error')}: {auth.get('error_description')}")
    token = auth["access_token"]
    scopes = sorted(s.rsplit("/", 1)[-1] for s in auth.get("scope", "").split())
    print(f"   app_id {auth.get('app_id')}, expires in {auth.get('expires_in')}s")
    print(f"   scopes: {', '.join(scopes)}")

    status, info = call("GET", "/v1/identity/oauth2/userinfo?schema=paypalv1.1", token)
    emails = [e.get("value") for e in info.get("emails", [])] if status == 200 else []
    print(f"\n2. Account behind the app: HTTP {status} {emails or info.get('message', '')}")

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=30)
    query = urllib.parse.urlencode({
        "start_date": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end_date": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fields": "transaction_info,payer_info",
    })
    status, txns = call("GET", f"/v1/reporting/transactions?{query}", token)
    print(f"\n3. Payment history (last 30 days): HTTP {status}")
    if status == 200:
        details = txns.get("transaction_details", [])
        print(f"   {len(details)} transactions, last refreshed {txns.get('last_refreshed_datetime')}")
        for t in details[:5]:
            ti, pi = t.get("transaction_info", {}), t.get("payer_info", {})
            print(f"   {ti.get('transaction_initiation_date')} {ti.get('transaction_amount', {}).get('value')} {pi.get('email_address')}")
    else:
        print(f"   {txns.get('name')}: {txns.get('message')}")

    status, listing = call("GET", "/v2/invoicing/invoices?total_required=true&page_size=5", token)
    print(f"\n4. List invoices: HTTP {status}, total {listing.get('total_items')}")

    draft = {
        "detail": {"currency_code": "USD", "note": "Invoice 1042: October mowing and leaf cleanup, 2 visits.", "payment_term": {"term_type": "NET_10"}},
        "primary_recipients": [{"billing_info": {"email_address": "ap-test@example.com"}}],
        "items": [{"name": "Lawn care, October", "quantity": "1", "unit_amount": {"currency_code": "USD", "value": "120.00"}}],
    }
    status, invoice = call("POST", "/v2/invoicing/invoices", token, body=draft)
    print(f"\n5. Create draft invoice: HTTP {status}")
    if status not in (200, 201):
        sys.exit(f"   {invoice.get('name')}: {invoice.get('message')} {json.dumps(invoice.get('details', []))[:300]}")
    invoice_id = invoice["id"]
    print(f"   id {invoice_id}, status {invoice.get('status')}, invoicer {invoice.get('invoicer', {}).get('email_address')}")

    status, sent = call("POST", f"/v2/invoicing/invoices/{invoice_id}/send", token, body={"send_to_recipient": False, "send_to_invoicer": False})
    print(f"\n6. Send it (no email): HTTP {status} {sent.get('message', '')}")

    status, detail = call("GET", f"/v2/invoicing/invoices/{invoice_id}", token)
    print(f"\n7. Read it back: HTTP {status}, status {detail.get('status')}")
    print(f"   recipient view url: {detail.get('detail', {}).get('metadata', {}).get('recipient_view_url')}")
    print(f"   fields: {', '.join(sorted(detail.keys()))}")


if __name__ == "__main__":
    main()
