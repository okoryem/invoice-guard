"""Print the receiving account's PayPal payment history for the last 30 days.

Usage: python3 spike/paypal_history.py
PayPal refreshes this data on a delay, so a new payment can take hours to appear.
"""

import urllib.parse
from datetime import datetime, timedelta, timezone

from paypal_check import call, load_env


def main():
    env = load_env()
    _, auth = call("POST", "/v1/oauth2/token", basic=f"{env['PAYPAL_CLIENT_ID']}:{env['PAYPAL_CLIENT_SECRET']}", form={"grant_type": "client_credentials"})
    end = datetime.now(timezone.utc)
    query = urllib.parse.urlencode({
        "start_date": (end - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end_date": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fields": "all",
    })
    status, data = call("GET", f"/v1/reporting/transactions?{query}", auth["access_token"])
    print(f"HTTP {status}, {len(data.get('transaction_details', []))} transactions, last refreshed {data.get('last_refreshed_datetime')}")
    for t in data.get("transaction_details", []):
        info, payer = t.get("transaction_info", {}), t.get("payer_info", {})
        print(f"  {info.get('transaction_initiation_date')}  {info.get('transaction_event_code')}  {info.get('transaction_amount', {}).get('value'):>9}"
              f"  counterparty: {payer.get('email_address')}  note: {info.get('transaction_note') or info.get('transaction_subject')}")


if __name__ == "__main__":
    main()
