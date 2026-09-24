"""SUPERSEDED as of the 2026-09-21 `_BID` pivot — see bid_main.py instead.
This whole-archive crawl's payload shape (`folderPath`, no Project Code)
no longer matches the ingest API (lib/project-card.ts's ProjectCardInput
now requires `projectCode` and at least one of `contractPath`/
`certificatePath`); every push from this script will be rejected. Left in
place, untouched, as a record of the pre-pivot design — see
PROJECT-CARD-BID-PIVOT-2026-09-21.md (repo root) for why the source
changed from the whole `PS` archive to just `_BID`'s two collections.

CLI entry point — run by hand from a machine with access to the `PS`
share (see ../docs/adr/0005-project-card-push-based-ingest.md; this app's
server can't reach it). Manual trigger for v1, not scheduled — see
PROJECT-SEARCH-GRILL-2026-09-15.md's R4-Q1.

Usage:
    python main.py --ps-root "\\192.168.99.1\PS" \
        --api-url https://psaidemo.icn21.local/api/project-card/ingest \
        --api-key <PROJECT_CARD_INGEST_KEY>

    # Discover + summarize only, print the payload, push nothing:
    python main.py --ps-root "\\192.168.99.1\PS" --dry-run
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from ai_provider import build_provider
from crawler import crawl
from push_client import push_projects


def main() -> int:
    parser = argparse.ArgumentParser(description="Crawl the PS share and push Project Cards to expense-billing-app.")
    parser.add_argument("--ps-root", required=True, help=r"e.g. \\192.168.99.1\PS")
    parser.add_argument("--api-url", help="Ingest endpoint, e.g. https://psaidemo.icn21.local/api/project-card/ingest")
    parser.add_argument("--api-key", help="PROJECT_CARD_INGEST_KEY — required unless --dry-run")
    parser.add_argument("--dry-run", action="store_true", help="Discover and summarize only; print the payload instead of pushing it")
    parser.add_argument(
        "--insecure",
        action="store_true",
        help="Skip TLS certificate verification — needed for psaidemo.icn21.local's self-signed cert",
    )
    args = parser.parse_args()

    if not args.dry_run and (not args.api_url or not args.api_key):
        parser.error("--api-url and --api-key are required unless --dry-run is set")

    ps_root = Path(args.ps_root)
    if not ps_root.is_dir():
        print(f"Cannot reach {ps_root} — check network access and the path.", file=sys.stderr)
        return 1

    provider = build_provider()
    payloads, stats = crawl(ps_root, provider)

    print(f"Found {stats.total_projects} project folders ({stats.summarized} summarized).")
    if stats.skipped_folders:
        print(
            f"Skipped {len(stats.skipped_folders)} folders that matched neither a project nor a "
            "year-folder pattern — review by hand (see discovery.py's PROJECT_MARKER_PREFIXES):",
            file=sys.stderr,
        )
        for folder in stats.skipped_folders:
            print(f"  {folder}", file=sys.stderr)

    if args.dry_run:
        print(json.dumps(payloads, ensure_ascii=False, indent=2))
        return 0

    if args.insecure:
        import urllib3

        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        print("WARNING: --insecure set, skipping TLS certificate verification.", file=sys.stderr)

    result = push_projects(args.api_url, args.api_key, payloads, verify_tls=not args.insecure)
    print(
        f"Pushed: {result.created} created, {result.updated} updated, "
        f"{result.skipped_verified_budget} verified budgets preserved, {result.rejected} rejected."
    )
    for error in result.errors:
        print(f"  rejected {error.get('folderPath')}: {error.get('message')}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
