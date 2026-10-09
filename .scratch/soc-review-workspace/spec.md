# SOC review workspace

Status: confirmed

## Problem

The selected SOC row's comparison details, Final Decision form, and cited PDF pages currently share one vertical inspector. Reviewers must scroll down to see evidence and back up to compare it with the requirement.

## Required behavior

- Clicking a review row opens a full-screen review workspace and leaves the filtered table in place behind it.
- On wide screens, the workspace shows two independently scrollable panes: comparison/decision on the left and cited PDF evidence on the right.
- The comparison pane keeps the item number, TOR text, bidder proposal, system recommendation, and Final Decision available while evidence is visible. Detailed axes remain collapsible.
- Evidence opens at the first cited page, shows one cited page at a time, and provides cited-page tabs, zoom in/out, fit-width, and an original-PDF link.
- Previous/next controls and the existing arrow/j/k shortcuts move through the currently displayed rows.
- Saving a Final Decision advances to the next row.
- Closing or changing rows with unsaved decision/note changes requires confirmation before discarding them.
- Closing restores the table, filters, and scroll position because the table remains mounted.
- On narrow screens, comparison and evidence are separate tabs instead of side-by-side panes.
- The workspace is an accessible modal: labelled dialog, close button, Escape handling, focus restoration, and background scroll lock.

## Test seam

Observe `SocReviewPanel` through rendered DOM and user interactions. Keep the existing evidence page route tests for PDF rendering and authorization.
