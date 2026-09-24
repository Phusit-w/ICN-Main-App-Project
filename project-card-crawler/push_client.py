"""Pushes discovered/summarized projects to the app's ingest API.

Runs from wherever the crawler runs (has share access, not the app server —
see ../docs/adr/0005-project-card-push-based-ingest.md), so this is a plain
HTTPS client, not a database connection.
"""
from __future__ import annotations

from dataclasses import dataclass

import requests


@dataclass
class PushResult:
    created: int
    updated: int
    skipped_verified_budget: int
    rejected: int
    errors: list[dict]


def push_projects(
    api_url: str,
    api_key: str,
    projects: list[dict],
    timeout_seconds: int = 120,
    verify_tls: bool = True,
) -> PushResult:
    """`projects` is already in the ingest API's wire shape (projectCode,
    client, projectName, descriptionTh, descriptionEn, contractPath,
    certificatePath, budgetAmount, budgetSource, vatStatus, budgetNote,
    year) — see lib/project-card.ts's ProjectCardInput for the authoritative
    shape this must match.

    `verify_tls=False` is for psaidemo.icn21.local's self-signed cert (see
    docs/DEPLOY-WINDOWS.md's reverse-proxy setup) — bid_main.py only exposes
    this via an explicit --insecure flag, never a silent default, since
    this same function would also be used against any future properly-
    certificated target.
    """
    response = requests.post(
        api_url,
        json={"projects": projects},
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=timeout_seconds,
        verify=verify_tls,
    )
    response.raise_for_status()
    body = response.json()
    return PushResult(
        created=body["created"],
        updated=body["updated"],
        skipped_verified_budget=body["skippedVerifiedBudget"],
        rejected=body["rejected"],
        errors=body["errors"],
    )


def fetch_known_project_codes(
    api_url: str,
    api_key: str,
    timeout_seconds: int = 30,
    verify_tls: bool = True,
) -> set[str]:
    """GET the ingest endpoint for every Project Code that already has a
    card — used by bid_main.py's `--only-new` mode so a re-run doesn't hand
    the reading step projects it's already read (see
    PROJECT-CARD-BID-PIVOT-2026-09-21.md)."""
    response = requests.get(
        api_url,
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=timeout_seconds,
        verify=verify_tls,
    )
    response.raise_for_status()
    return set(response.json()["projectCodes"])
