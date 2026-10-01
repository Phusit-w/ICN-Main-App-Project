# Project Card crawler

Since the 2026-09-21 pivot, Project Card's source is the `PS` share's
`_BID` area (`00 Contract` + `01 หนังสือรับรองผลงาน ICN`) — signed-contract
projects only, not the whole archive. See
`../app/(app)/project-card/CONTEXT.md` for the domain glossary and
`../../PROJECT-CARD-BID-PIVOT-2026-09-21.md` (repo root) for the pivot's
full design history; `../../PROJECT-SEARCH-GRILL-2026-09-15.md` covers the
original (now superseded) whole-archive design.

## Setup

```powershell
cd "C:\Phusit\Claude Project\ICN Apps\Main_Project_Build_App\project-card-crawler"
python -m pip install -r requirements.txt
```

## The `_BID` workflow

Nearly every PDF under `_BID` is a scanned image with no text layer (see the
pivot doc's measured facts), so this isn't a fully unattended crawl like the
old one was — reading a document's Budget/VAT/year/description needs a
person or Claude reading the rendered pages in session. The pipeline splits
into two steps because of that:

**1. Discover** — pure filesystem/filename work, no document content read.
Prints a JSON worklist of every Project Code found, with its candidate
Contract/Certificate PDF paths (`bid_discovery.py`):

```powershell
# Every _BID project:
python bid_main.py --ps-root "\\192.168.99.1\PS"

# Only projects that don't have a card yet:
python bid_main.py --ps-root "\\192.168.99.1\PS" --only-new `
  --api-url https://psaidemo.icn21.local/api/project-card/ingest `
  --api-key <PROJECT_CARD_INGEST_KEY> --insecure
```

A project with more than one candidate document (a multi-version
certificate, e.g. PEA012's plain/R1/DC-Part) is reported with every
candidate — picking (or auto-picking a stated Superseding Version, see
CONTEXT.md) is the reading step's job, never guessed here.

**2. Read + push** — for each project in the worklist, read its candidate
PDF(s) (render to PNG, e.g. with PyMuPDF, then read the image — see the
pivot doc's "technical how-tos" for the exact method validated against the
8-project pilot), build one JSON object per project in
`lib/project-card.ts`'s `ProjectCardInput` shape, then push the finished
batch:

```powershell
python push_manual_entries.py --entries entries.json `
  --api-url https://psaidemo.icn21.local/api/project-card/ingest `
  --api-key <PROJECT_CARD_INGEST_KEY> --insecure

# Validate the file's shape without pushing:
python push_manual_entries.py --entries entries.json --dry-run
```

`--api-key` is set on the production Windows service's own environment
(`nssm get ExpenseBillingApp AppEnvironmentExtra`), not in a `.env` file —
the running service never reads `.env` at all (see
docs/DEPLOY-WINDOWS.md). `--insecure` skips TLS certificate verification,
needed because `psaidemo.icn21.local` uses a self-signed cert (see its
reverse-proxy setup in docs/DEPLOY-WINDOWS.md) — omit it if that ever
changes to a real certificate.

Re-index is a manual step for v1 (not scheduled) — see the original grill
doc's R4-Q1. Pushing again for a project that already has a card upserts it
(keyed by `projectCode`) and never overwrites a budget a person has already
verified in the app, or a non-blank description/year with a blank one from
a partial re-read (see `../lib/project-card.ts` and the ingest route).

## Superseded: the whole-archive crawl (`main.py`, `crawler.py`, `discovery.py`)

Pre-pivot, this crawled every `_Project *` folder on the whole share and
used an AI provider (off by default) to read non-scanned text. Its ingest
payload shape (`folderPath`, no Project Code) no longer matches the current
API — every push from `main.py` today is rejected. Left in place untouched
as a design record; see `PROJECT-CARD-BID-PIVOT-2026-09-21.md` for why the
source changed.

### Known limitation: folder detection isn't perfect

`discovery.py` decides a folder is a project by looking for `_TOR`/
`Proposal*`/etc. subfolders inside it (or an explicit year folder for
NT/NBTC-style clients — see the module docstring). Run against the real
share on 2026-09-16, it found 205 projects and skipped 44 folders that
matched neither pattern. Spot-checking the skipped list found a mix of:

- genuinely non-project folders (shared "Proposal"/reference folders sitting
  directly under a client, e.g. `MEA\Proposal`, `KT\WW Information`) —
  correctly skipped
- real projects that just don't have the expected marker subfolders (e.g.
  `CMU\CMU001 COVID`, `BBTEC\BBT002 MA OFC Y66 PEA`) — missed
- at least two clients (`AOT`, `DOPA`) where the client folder itself seems
  to be a single, un-subdivided project rather than a container of several
  — a layout variant `discovery.py` doesn't handle at all

`main.py` prints every skipped folder to stderr specifically so these can
be reviewed by hand rather than silently dropped (matches Round 1 Q2's
"auto-detect + a confirm/edit pass" recommendation — the pass itself is a
manual `stderr` review for v1, not a UI). If a skipped folder turns out to
be a real project, there's no override list yet — add a case to
`discovery.py`'s heuristic (and a test in `test_discovery.py`) once a
pattern emerges, rather than hand-editing one-off exceptions.

### AI summarization was off by default

`ai_provider.py` mirrors `../soc-worker/ai_provider.py`'s fail-closed
pattern exactly: `build_provider()` always returns `DisabledProvider`. This
belonged to the whole-archive pipeline's automated read; the `_BID`
pipeline reads scanned documents a different way (Claude in session — see
above), so this module isn't part of the current workflow.

## Tests

```powershell
python -m unittest test_bid_discovery test_discovery test_extract_text test_crawler -v
```

All pure-logic (Project Code/document matching, folder detection, text
extraction, payload building) — no live share or server needed.
`bid_discovery.py`'s and `discovery.py`'s heuristics have additionally been
spot-checked against the real share; see "Known limitation" above and
`PROJECT-CARD-BID-PIVOT-2026-09-21.md`'s measured facts.
