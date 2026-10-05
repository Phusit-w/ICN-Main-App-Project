# Project Card inherits expense-billing-app's flat access model

`expense-billing-app` has no per-resource permission model — every authenticated account can see every record, and `role` only gates the admin panel, not data. Project Card will expose budget figures for every client project in the `PS` share to any logged-in user. We considered gating it behind a new restricted role given the sensitivity of cross-client budget data, but decided to launch with the app's existing flat access model instead, since the current user roster is small and already trusted with the app's other financial data (expense records). Revisit before the user roster grows to include people who shouldn't see cross-client budgets — the risk was raised and consciously accepted for v1, not overlooked.

Update 2026-10-05: per-app access added — see [0007](0007-per-app-access.md). Budgets are still visible to anyone with Project Card access, view-only included.
