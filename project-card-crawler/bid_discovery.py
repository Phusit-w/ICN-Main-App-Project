"""Finds Project Code -> candidate document paths under the `PS` share's
`_BID` area — the source for Project Card since the 2026-09-21 pivot away
from the whole-archive crawl (see ../app/(app)/project-card/CONTEXT.md and
PROJECT-CARD-BID-PIVOT-2026-09-21.md, repo root).

This module is pure filesystem/filename work, deliberately: nearly every PDF
under `_BID` is a scanned image with no text layer (see the pivot doc's
measured facts), so anything content-dependent — which candidate document
actually states a Budget, whether one version explicitly supersedes another
(CONTEXT.md's Superseding Version entry) — needs a person or Claude reading
the rendered pages in session, not this script. What this module CAN do
without reading a single page: find every PDF that plausibly belongs to a
project, grouped by Project Code, so that reading step has a worklist
instead of having to grep the share by hand.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

# Matches the client-prefixed sequence number that identifies a project
# (e.g. `NT004`, `PEA012`, `CAT001`) — see CONTEXT.md's Project Code entry.
# 2-6 letters covers every prefix seen so far (NT, PEA, CAT, MEA, CMU, TKC,
# OBEC, ...); normalized to uppercase since the share's own casing isn't
# consistent (folder/file names mix cases by hand).
PROJECT_CODE_PATTERN = re.compile(r"[A-Za-z]{2,6}\d{3}")

CONTRACT_DIRNAME = "00 Contract"
CERTIFICATE_DIRNAME = "01 หนังสือรับรองผลงาน ICN"

# Decision 6 (PROJECT-CARD-BID-PIVOT-2026-09-21.md): drop attachment/
# appendix/PO filenames and .rar archives before treating what's left as
# document candidates. Only PDFs are ever real documents here anyway — the
# pivot's file-count survey found every non-pdf file under `_BID` was an
# index/archive artifact (.db/.rar/.zip), never a document to read.
_EXCLUDED_NAME_SUBSTRINGS = ("เอกสารแนบ", "ภาคผนวก")
_EXCLUDED_NAME_PATTERN = re.compile(r"\bpo\b", re.IGNORECASE)


def _extract_project_code(name: str) -> str | None:
    match = PROJECT_CODE_PATTERN.search(name)
    return match.group(0).upper() if match else None


def _is_excluded(filename: str) -> bool:
    if any(marker in filename for marker in _EXCLUDED_NAME_SUBSTRINGS):
        return True
    return bool(_EXCLUDED_NAME_PATTERN.search(filename))


@dataclass(frozen=True)
class BidProject:
    project_code: str
    client: str
    # Every PDF found under this project's code, for each collection — not
    # narrowed to one "the" document. When more than one candidate exists
    # (a multi-version certificate, an attachment that slipped past the
    # filename filter), picking the right one is the reading step's job,
    # not discovery's (see the module docstring).
    contract_candidates: list[Path] = field(default_factory=list)
    certificate_candidates: list[Path] = field(default_factory=list)


@dataclass(frozen=True)
class BidDiscoveryResult:
    projects: list[BidProject]
    # PDFs whose filename (and parent folder name) carry no recognisable
    # Project Code — surfaced for manual review rather than silently
    # dropped, same policy as discovery.py's `skipped` list.
    unmatched_files: list[Path]


def _iter_candidate_files(collection_root: Path) -> list[Path]:
    if not collection_root.is_dir():
        return []
    files: list[Path] = []
    for client_dir in sorted(p for p in collection_root.iterdir() if p.is_dir()):
        for path in sorted(client_dir.rglob("*")):
            if not path.is_file():
                continue
            if path.suffix.lower() != ".pdf":
                continue
            if _is_excluded(path.name):
                continue
            files.append(path)
    return files


def discover_bid_projects(bid_root: Path) -> BidDiscoveryResult:
    """`bid_root` is the `_BID` folder itself (containing `00 Contract` and
    `01 หนังสือรับรองผลงาน ICN`). A project's client is the immediate
    subfolder name under either collection, matching how both are laid out
    (`<client>\\<files or project subfolders>` — PROJECT-CARD-BID-PIVOT-
    2026-09-21.md's measured facts)."""
    grouped: dict[str, BidProject] = {}
    unmatched: list[Path] = []

    for collection_root, kind in (
        (bid_root / CONTRACT_DIRNAME, "contract"),
        (bid_root / CERTIFICATE_DIRNAME, "certificate"),
    ):
        for path in _iter_candidate_files(collection_root):
            client = path.relative_to(collection_root).parts[0]
            # The code usually lives in the filename; when a project keeps
            # its files in their own subfolder instead, fall back to that
            # subfolder's name (still never the client folder itself).
            code = _extract_project_code(path.name)
            if code is None and path.parent != collection_root / client:
                code = _extract_project_code(path.parent.name)
            if code is None:
                unmatched.append(path)
                continue

            project = grouped.setdefault(code, BidProject(project_code=code, client=client))
            (project.contract_candidates if kind == "contract" else project.certificate_candidates).append(path)

    projects = [grouped[code] for code in sorted(grouped)]
    return BidDiscoveryResult(projects=projects, unmatched_files=unmatched)


def filter_new_projects(projects: list[BidProject], known_codes: set[str]) -> list[BidProject]:
    """"Only new projects" mode (PROJECT-CARD-BID-PIVOT-2026-09-21.md's
    prerequisite before reading the full ~168-contract set): once a Project
    Code already has a card, a re-run of discovery shouldn't hand it back
    to the reading step again. `known_codes` comes from the ingest API's
    GET endpoint (see push_client.fetch_known_project_codes) — the only
    place that actually knows what's already been pushed."""
    return [project for project in projects if project.project_code not in known_codes]
