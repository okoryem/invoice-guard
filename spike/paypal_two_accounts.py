"""Can the receiving account read an invoice that another account sent it?

Usage: python3 spike/paypal_two_accounts.py <receiver sandbox email>
Needs both app credential pairs in .env: PAYPAL_CLIENT_* (receiver) and
PAYPAL_SENDER_CLIENT_* (sender). Sends one real sandbox invoice, email included.
"""

import sys
import urllib.parse
from datetime import datetime, timedelta, timezone

from paypal_check import call, load_env


def token_for(client_id, secret):
    status, auth = call("POST", "/v1/oauth2/token", basic=f"{client_id}:{secret}", form={"grant_type": "client_credentials"})
    if status != 200:
        sys.exit(f"Token failed: HTTP {status} {auth.get('error_description')}")
    return auth["access_token"], "reporting/search/read" in auth.get("scope", "")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    receiver_email = sys.argv[1]
    env = load_env()
    receiver, receiver_search = token_for(env["PAYPAL_CLIENT_ID"], env["PAYPAL_CLIENT_SECRET"])
    sender, _ = token_for(env["PAYPAL_SENDER_CLIENT_ID"], env["PAYPAL_SENDER_CLIENT_SECRET"])
    print(f"Both tokens issued. Receiver token has transaction search scope: {receiver_search}")

    draft = {
        "detail": {"currency_code": "USD", "note": "Invoice 20931 for 40 cases of packaging, PO 7714. Net 30.", "payment_term": {"term_type": "NET_30"}},
        "invoicer": {"business_name": "Brightline Supply"},
        "primary_recipients": [{"billing_info": {"email_address": receiver_email}}],
        "items": [{"name": "Packaging, 40 cases", "quantity": "40", "unit_amount": {"currency_code": "USD", "value": "12.05"}}],
    }
    status, invoice = call("POST", "/v2/invoicing/invoices", sender, body=draft)
    if status not in (200, 201):
        sys.exit(f"Create failed: HTTP {status} {invoice.get('message')} {invoice.get('details')}")
    invoice_id = invoice["id"]
    status, sent = call("POST", f"/v2/invoicing/invoices/{invoice_id}/send", sender, body={"send_to_recipient": True, "send_to_invoicer": False})
    print(f"\n1. Sender created and sent {invoice_id}: HTTP {status} {sent.get('message', '')}")

    status, detail = call("GET", f"/v2/invoicing/invoices/{invoice_id}", sender)
    print(f"2. Sender reads it: HTTP {status}, status {detail.get('status')}, invoicer {detail.get('invoicer', {}).get('email_address')}")

    status, detail = call("GET", f"/v2/invoicing/invoices/{invoice_id}", receiver)
    print(f"3. RECEIVER reads it by id: HTTP {status} {detail.get('status') or detail.get('name')} {detail.get('message', '')}")

    status, listing = call("GET", "/v2/invoicing/invoices?total_required=true&page_size=20", receiver)
    ids = [i.get("id") for i in listing.get("items", [])]
    print(f"4. RECEIVER lists invoices: HTTP {status}, total {listing.get('total_items')}, contains it: {invoice_id in ids}")

    status, found = call("POST", "/v2/invoicing/search-invoices?total_required=true", receiver, body={"recipient_email": receiver_email})
    ids = [i.get("id") for i in found.get("items", [])]
    print(f"5. RECEIVER searches by its own email: HTTP {status}, total {found.get('total_items')}, contains it: {invoice_id in ids}")

    end = datetime.now(timezone.utc)
    query = urllib.parse.urlencode({
        "start_date": (end - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end_date": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fields": "transaction_info,payer_info",
    })
    status, txns = call("GET", f"/v1/reporting/transactions?{query}", receiver)
    print(f"6. RECEIVER payment history: HTTP {status} {txns.get('message') or str(len(txns.get('transaction_details', []))) + ' transactions'}")


if __name__ == "__main__":
    main()
