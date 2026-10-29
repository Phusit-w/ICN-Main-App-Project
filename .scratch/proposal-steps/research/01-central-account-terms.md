# Research: central Claude account serving other employees (ticket 01)

Date checked: 2026-10-29. Question: [issues/01-central-account-terms.md](../issues/01-central-account-terms.md).

Shape under review: one Claude subscription (Pro/Max, or one Team/Enterprise seat) is logged in on (a) the shared server or (b) one teammate's PC, and runs `claude -p` for SOC check requests clicked by employees who have no Claude account. No pay-per-token API key.

Quotes are verbatim from the pages fetched on the date above, except where marked "(summary)", which means the fetch tool gave back a close paraphrase rather than exact text. Section 6 is interpretation and is kept apart from the sources.

## 1. Claude Code docs: Legal and compliance

Source: https://code.claude.com/docs/en/legal-and-compliance

Which terms apply:

> Your use of Claude Code is subject to:
> * Commercial Terms of Service - for Team, Enterprise, and Claude API users
> * Consumer Terms of Service - for Free, Pro, and Max users

Usage limits assume one person:

> Advertised usage limits for Pro and Max plans assume ordinary, individual usage of Claude Code and the Agent SDK.

OAuth (subscription login) scope:

> **OAuth authentication** is intended exclusively for purchasers of Claude Free, Pro, Max, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic applications.

> **Developers** building products or services that interact with Claude's capabilities, including those using the Agent SDK, should use API key authentication through Claude Console or a supported cloud provider. Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users. Moreover, developers may not collect, store, or intermediate Claude.ai credentials or session tokens — sign-in to a Claude account must complete through Anthropic's own flow.

> This does not restrict how customers provision and manage their own API keys or third-party inference provider credentials — for example, configuring an API key in a development environment, secrets manager, or machine image for use by the customer's own authorized users — provided the resulting usage is billed to the key owner under their agreement with Anthropic (or the applicable provider) and is not resold or intermediated as described above. Nor does it prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription, including where a platform hosts Claude Code as described under *Can customers offer Claude Code in their products?* above.

> Anthropic reserves the right to take measures to enforce these restrictions and may do so without prior notice.

Running Claude Code inside your own product/service:

> **Customers may not pay for, resell, or intermediate Claude usage on their end users' behalf.** Each end user must authenticate with their own Anthropic API key, Claude subscription plan credentials, or 3P inference provider credential (Amazon Bedrock, Google Cloud's Agent Platform, Microsoft Foundry). That usage is billed directly to the end user under their own agreement with Anthropic or, for third-party inference providers, with the applicable provider.

Note the carve-out for shared credentials covers **API keys / cloud-provider credentials** for "the customer's own authorized users". There is no matching carve-out for subscription (OAuth) credentials.

## 2. Consumer Terms (Free, Pro, Max)

Source: https://www.anthropic.com/legal/consumer-terms (effective Oct 8, 2025)

Scope:

> govern your use of Claude.ai, Claude Pro, and other products and services that we may offer for individuals

Account sharing (account section):

> You may not share your Account login information, Anthropic API key, or Account credentials with anyone else.

> You also may not make your Account available to anyone else.

> You are responsible for all activity occurring under your Account.

Automated access (prohibited-use list; the fetch tool returned it in two pieces, joined here):

> Except when you are accessing our Services via an Anthropic API Key or where we otherwise explicitly permit it, to access the Services through automated or non-human means, whether through a bot, script, or otherwise.

Suspension (summary of Section "Termination"): "We may suspend or terminate your access to the Services (including any Subscriptions) at any time without notice".

Training (summary): Materials may be used to train models "unless you opt out of training through your account settings"; feedback and safety-flagged content may still be used.

## 3. Usage Policy (all users)

Source: https://www.anthropic.com/legal/aup (page shows "Effective Nov 12, 2026"; "See version history" link)

Under "Do Not Abuse Our Platform", prohibited:

> Resell, proxy, or otherwise provide access to Claude through unauthorized means, including services that route requests through consumer subscriptions or misrepresent the product or client being used

## 4. Commercial Terms + Team/Enterprise plans

Commercial Terms: https://www.anthropic.com/legal/commercial-terms (effective Jun 17, 2025)

> Services under these Terms are not for consumer use.

> Customer and its Users may only use the Services in compliance with these Terms (D.2)

> Customer is responsible for all activity under its account. (D.5)

> resell the Services except as expressly approved by Anthropic (D.4, prohibited)

> Anthropic may not train models on Customer Content from Services. (B)

The Commercial Terms do not themselves talk about credential sharing.

Team plan: https://support.claude.com/en/articles/9266767-what-is-the-claude-team-plan

> Each seat is for one named individual.

> Team plans require a minimum of two members.

> Usage limits on Team plans are per-member, rather than applied to the team as a whole.

Prices given there: Standard $25/member/month monthly ($20 annual); Premium $125 monthly ($100 annual). Admins can enable prepaid usage credits ("allowing team members to continue working after reaching limits") with org- and user-level spend caps. Anthropic's Aug 2025 announcement says extra usage is billed "at standard API rates" (https://www.anthropic.com/news/claude-code-on-team-and-enterprise).

Claude Code authentication doc (https://code.claude.com/docs/en/authentication): for Teams/Enterprise, "Team members install Claude Code and log in with their claude.ai accounts." The doc lists Claude Console (API billing), a self-hosted Claude apps gateway, Bedrock, Vertex/Agent Platform, and Foundry as the other team options. All of these are usage-billed rather than subscription-billed.

Long-lived token (same doc): `claude setup-token` makes a one-year OAuth token (`CLAUDE_CODE_OAUTH_TOKEN`) "For CI pipelines, scripts, or other environments where interactive browser login isn't available". It "authenticates with your Claude subscription and requires a Pro, Max, Team, or Enterprise plan." The doc says nothing about using that token for other people's requests. That limit comes from the legal page and terms above.

## 5. Data use and quota facts for a shared queue

Data (https://code.claude.com/docs/en/data-usage):

- Consumer (Free/Pro/Max): "We will train new models using data from Free, Pro, and Max accounts when this setting is on (including when you use Claude Code from these accounts)." Retention is 5 years if training is on and 30 days if it is off.
- Commercial (Team/Enterprise/API): "Anthropic does not train generative models using code or prompts sent to Claude Code under commercial terms". Standard retention is 30 days.
- Local: transcripts are stored in plaintext under `~/.claude/projects/` for 30 days by default. On a shared server or a teammate's PC, every requester's TOR/datasheet content would sit in that one account's profile.

Quota (https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan):

> Both Pro and Max plans have a five-hour session limit and a weekly limit.

> These limits are shared across Claude and Claude Code, meaning all activity in both tools counts against the same limits.

- That article "applies to individual consumers using Pro or Max plan subscriptions".
- Going past the limit means usage credits or API credits billed "at standard API rates", which is pay-per-token.
- Team limits are per member and "can't be pooled". One seat cannot draw on the quota of other seats.
- From this project's own measurements (memory, not Anthropic): one SOC item costs about 8–32% of a Pro 5-hour window. A shared Pro account would run out within a few checks per window.

## 6. Interpretation (not stated by Anthropic in these words)

| Variant | Assessment | Main risk |
|---|---|---|
| (a) Pro/Max account logged in on the shared server, serving non-subscribers | Conflicts with explicit text: "may not make your Account available to anyone else", the AUP ban on "services that route requests through consumer subscriptions", and the legal page's "route requests through Free, Pro, or Max plan credentials on behalf of their users". The automation exception covers API keys and "where we otherwise explicitly permit it". Claude Code is explicitly permitted, but only for "ordinary, individual usage". | Suspension or termination without notice ("may do so without prior notice"). Consumer data may be used for training unless training is turned off. One quota for everyone. |
| (b) Teammate's personal Pro/Max on their PC, serving others | Same clauses apply. It does not matter which machine holds the login. The teammate also carries "all activity occurring under your Account" plus their own personal quota and data. | Same as (a), and the risk falls on one employee personally. |
| Team/Enterprise seat used as a shared service account | Commercial Terms do not ban sharing in the abstract, but the Team plan says "Each seat is for one named individual", and Claude Code docs bar intermediating subscription usage for users who have no credentials of their own. The SOC check does not look like "ordinary use" of one seat. | Likely a seat-terms violation. No training on data (commercial). Per-seat quota is not pooled. |
| Each employee gets a Team Standard/Premium seat and runs their own Runner | Matches the docs ("Team members install Claude Code and log in with their claude.ai accounts"). This is ADR 0008 with company-paid seats. | Cost per seat (min 2). Fully supported. |
| Shared API key / Bedrock / Vertex / Foundry / apps gateway | Explicitly allowed for "the customer's own authorized users", billed to the key owner. | Pay-per-token. This is the shape the user wants to avoid. |

I found no Anthropic offering, short of usage-billed API/cloud credentials (or Team/Enterprise extra usage, which is also billed at API rates), that lets one subscription serve people who have no Claude seat. The legal page points such cases to "contact sales", which is the only route for a negotiated exception ("Unless we've mutually agreed otherwise").

## 7. OpenAI: ChatGPT Plus/Pro + Codex CLI (brief)

- OpenAI Terms of Use: openai.com returned 403 to the fetch tool, so this wording comes from search results that show the clause on openai.com/terms and openai.com/en-GB/policies/row-terms-of-use/: "You may not share your account credentials or make your account available to anyone else and are responsible for all activities that occur under your account." The same wording appears in the EU terms (https://openai.com/policies/eu-terms-of-use/). I could not load the page to check this directly.
- Codex auth docs (https://learn.chatgpt.com/docs/auth, redirected from developers.openai.com/codex/auth):
  - "Use API key authentication for programmatic Codex CLI workflows, such as CI/CD jobs."
  - "API keys are still the recommended default for automation."
  - "When you sign in with an API key, Codex uses standard API pricing instead of included ChatGPT plan credits."
  - ChatGPT Enterprise admins can allow access tokens for "trusted, non-interactive Codex local workflows"; "Access tokens are intended for trusted scripts, schedulers, and private CI runners."
  - On `~/.codex/auth.json`: "treat ... like a password", "Don't ... share it in chat."
- Usage limits: Codex shares one allowance with other ChatGPT features on the plan (help.openai.com/en/articles/11369540).
- Unverified: a secondary blog says the OpenAI Services Agreement (Business/Enterprise) requires each end-user account to be "used by, a single End User". I did not check this against OpenAI's own text.
- Interpretation: Plus/Pro has the same "no making your account available to anyone else" bar. The only OpenAI non-API automation path in the docs is Enterprise access tokens for trusted workflows. The docs do not say those tokens may serve people without seats.

## Sources

- https://code.claude.com/docs/en/legal-and-compliance
- https://code.claude.com/docs/en/authentication
- https://code.claude.com/docs/en/data-usage
- https://www.anthropic.com/legal/consumer-terms
- https://www.anthropic.com/legal/commercial-terms
- https://www.anthropic.com/legal/aup
- https://support.claude.com/en/articles/9266767-what-is-the-claude-team-plan
- https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan
- https://www.anthropic.com/news/claude-code-on-team-and-enterprise
- https://learn.chatgpt.com/docs/auth
- https://help.openai.com/en/articles/11369540
- https://openai.com/policies/eu-terms-of-use/ (via search result; direct fetch blocked)
