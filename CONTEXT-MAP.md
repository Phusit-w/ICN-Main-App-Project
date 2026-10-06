# Context Map

## Contexts

- [Expense Billing](./CONTEXT.md): expense documents created, reviewed, printed, and downloaded by authenticated users
- SOC Compliance (`app/(app)/soc/`, `soc-worker/`): compliance-document checking; per ADR 0008 checks run on each reviewer's machine and the server only stores and shows results — vocabulary in `docs/SOC-DOMAIN-GLOSSARY.md`, no `CONTEXT.md` yet
- [Project Card](./app/(app)/project-card/CONTEXT.md): a searchable catalog of past/current proposal projects (client, budget, year, description) extracted from the company's `PS` network share

## Relationships

None of the three contexts share domain concepts today — each is independent. They share only infrastructure: the same Postgres database, the same `User` login/session model, and (SOC, Project Card) the same async job-worker pattern for background processing.
