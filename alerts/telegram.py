"""Telegram status message to the master number (FINAL_PRD). Needs TELEGRAM_BOT_TOKEN and
TELEGRAM_CHAT_ID; without them, or if the API call fails, falls back to an in-app-only result —
`send()` always returns a result dict, it never raises for a delivery failure.
"""
from __future__ import annotations

import os

import requests

TELEGRAM_API = "https://api.telegram.org"


def status_message(run) -> str:
    """One-line status for a dataset's current run: health, band, active alerts, RUL."""
    h = run.analysis.health
    bits = [f"{run.name}: Health {h.score:.0f}/100 ({h.band})"]
    n = len(run.analysis.alerts)
    if n:
        bits.append(f"{n} alert{'s' if n != 1 else ''} this run")
    rul = run.analysis.rul
    if rul:
        bits.append(f"RUL {run.summary.get('rul_display') or f'{rul.years_low:.0f}-{rul.years_high:.0f} yr'}")
    return " · ".join(bits)


def send(message: str) -> dict:
    """POST to the Telegram Bot API if configured. Always returns {delivered, fallback, detail}."""
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return {
            "delivered": False,
            "fallback": True,
            "detail": "Telegram not configured (set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID); shown in-app instead.",
        }
    try:
        r = requests.post(f"{TELEGRAM_API}/bot{token}/sendMessage", json={"chat_id": chat_id, "text": message}, timeout=5)
        r.raise_for_status()
        return {"delivered": True, "fallback": False, "detail": "Sent to the master number via Telegram."}
    except Exception as exc:  # network error, bad token, bad chat id, Telegram outage, ...
        return {"delivered": False, "fallback": True, "detail": f"Telegram unreachable ({exc}); shown in-app instead."}
