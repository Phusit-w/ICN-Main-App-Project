"""Pushes finished Project Card entries — already read from `_BID` PDFs by
a person or Claude in session (see PROJECT-CARD-BID-PIVOT-2026-09-21.md;
bid_main.py only discovers candidates, it doesn't read them) — to the
ingest API. Formalizes the same push step the 8-project pilot did by hand.

Input is a JSON file: a list of objects matching lib/project-card.ts's
ProjectCardInput wire shape, e.g.:

    [
      {
        "projectCode": "NT004",
        "client": "NT",
        "projectName": "MA ระบบชุมสายโทรศัพท์ระหว่างประเทศ BKK6",
        "descriptionTh": "",
        "descriptionEn": "",
        "contractPath": null,
        "certificatePath": "\\\\192.168.99.1\\PS\\_BID\\01 ...\\NT\\NT004 ...pdf",
        "budgetAmount": 21175300.00,
        "budgetSource": "certificate",
        "vatStatus": "included",
        "budgetNote": "",
        "year": 2022
      }
    ]

Usage:
    python push_manual_entries.py --entries entries.json \
        --api-url https://psaidemo.icn21.local/api/project-card/ingest \
        --api-key <PROJECT_CARD_INGEST_KEY> [--insecure]

    # Validate the file's shape without pushing:
    python push_manual_entries.py --entries entries.json --dry-run
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from push_client import push_projects


def main() -> int:
    parser = argparse.ArgumentParser(description="Push manually-read _BID Project Card entries to expense-billing-app.")
    parser.add_argument("--entries", required=True, help="Path to a JSON file: a list of ProjectCardInput-shaped objects")
    parser.add_argument("--api-url", help="Ingest endpoint, e.g. https://psaidemo.icn21.local/api/project-card/ingest")
    parser.add_argument("--api-key", help="PROJECT_CARD_INGEST_KEY — required unless --dry-run")
    parser.add_argument("--dry-run", action="store_true", help="Parse and print the entries; push nothing")
    parser.add_argument(
        "--insecure",
        action="store_true",
        help="Skip TLS certificate verification — needed for psaidemo.icn21.local's self-signed cert",
    )
    args = parser.parse_args()

    if not args.dry_run and (not args.api_url or not args.api_key):
        parser.error("--api-url and --api-key are required unless --dry-run is set")

    entries_path = Path(args.entries)
    try:
        projects = json.loads(entries_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"Could not read {entries_path}: {error}", file=sys.stderr)
        return 1

    if not isinstance(projects, list) or not projects:
        print(f"{entries_path} must contain a non-empty JSON array.", file=sys.stderr)
        return 1

    print(f"Loaded {len(projects)} entries from {entries_path}.")
    if args.dry_run:
        print(json.dumps(projects, ensure_ascii=False, indent=2))
        return 0

    if args.insecure:
        import urllib3

        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        print("WARNING: --insecure set, skipping TLS certificate verification.", file=sys.stderr)

    result = push_projects(args.api_url, args.api_key, projects, verify_tls=not args.insecure)
    print(
        f"Pushed: {result.created} created, {result.updated} updated, "
        f"{result.skipped_verified_budget} verified budgets preserved, {result.rejected} rejected."
    )
    for error in result.errors:
        print(f"  rejected {error.get('projectCode')}: {error.get('message')}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
