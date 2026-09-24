r"""CLI entry point for the `_BID` pipeline (PROJECT-CARD-BID-PIVOT-2026-09-
21.md) — replaces main.py/crawler.py's whole-archive crawl as Project
Card's source. Run by hand from a machine with `PS` share access (see
../docs/adr/0005-project-card-push-based-ingest.md; this app's server can't
reach it).

This only DISCOVERS candidate documents and prints a worklist — it does not
read PDF content or push anything. Nearly every `_BID` PDF is a scanned
image with no text layer, so extracting Budget/VAT/year/description needs a
person or Claude reading the rendered pages in session (see the pivot doc's
"technical how-tos"); that reading step then builds the ingest payloads by
hand and pushes them with push_manual_entries.py, not this script.

Usage:
    # Print every _BID project's candidate documents:
    python bid_main.py --ps-root "\\192.168.99.1\PS"

    # Only projects that don't have a card yet (needs the ingest API, since
    # only it knows what's already been pushed):
    python bid_main.py --ps-root "\\192.168.99.1\PS" --only-new \
        --api-url https://psaidemo.icn21.local/api/project-card/ingest \
        --api-key <PROJECT_CARD_INGEST_KEY>
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from bid_discovery import discover_bid_projects, filter_new_projects
from push_client import fetch_known_project_codes

BID_SUBDIR = "_BID"


def _project_to_dict(project) -> dict:
    return {
        "projectCode": project.project_code,
        "client": project.client,
        "contractCandidates": [str(p) for p in project.contract_candidates],
        "certificateCandidates": [str(p) for p in project.certificate_candidates],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Discover _BID Project Card candidates on the PS share.")
    parser.add_argument("--ps-root", required=True, help=r"e.g. \\192.168.99.1\PS")
    parser.add_argument("--only-new", action="store_true", help="Skip projects that already have a card (needs --api-url/--api-key)")
    parser.add_argument("--api-url", help="Ingest endpoint, e.g. https://psaidemo.icn21.local/api/project-card/ingest")
    parser.add_argument("--api-key", help="PROJECT_CARD_INGEST_KEY — required with --only-new")
    parser.add_argument(
        "--insecure",
        action="store_true",
        help="Skip TLS certificate verification — needed for psaidemo.icn21.local's self-signed cert",
    )
    args = parser.parse_args()

    if args.only_new and (not args.api_url or not args.api_key):
        parser.error("--api-url and --api-key are required with --only-new")

    bid_root = Path(args.ps_root) / BID_SUBDIR
    if not bid_root.is_dir():
        print(f"Cannot reach {bid_root} — check network access and the path.", file=sys.stderr)
        return 1

    if args.insecure:
        import urllib3

        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    result = discover_bid_projects(bid_root)
    projects = result.projects

    if args.only_new:
        known_codes = fetch_known_project_codes(args.api_url, args.api_key, verify_tls=not args.insecure)
        before = len(projects)
        projects = filter_new_projects(projects, known_codes)
        print(f"--only-new: {before - len(projects)} of {before} projects already have a card, skipped.", file=sys.stderr)

    if result.unmatched_files:
        print(
            f"{len(result.unmatched_files)} PDF(s) carry no recognisable Project Code — review by hand "
            "(see bid_discovery.py's PROJECT_CODE_PATTERN):",
            file=sys.stderr,
        )
        for path in result.unmatched_files:
            print(f"  {path}", file=sys.stderr)

    if result.excluded_only_files:
        print(
            f"{len(result.excluded_only_files)} project code(s) had every file filtered out as an "
            "attachment/appendix/PO name — no readable source, review by hand:",
            file=sys.stderr,
        )
        for code, paths in sorted(result.excluded_only_files.items()):
            for path in paths:
                print(f"  {code}: {path}", file=sys.stderr)

    print(f"{len(projects)} project(s) to read.", file=sys.stderr)
    print(json.dumps([_project_to_dict(p) for p in projects], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
