# เงื่อนไขการใช้บัญชี Claude ส่วนกลาง

Type: research
Status: resolved
Blocked by: —

## Question

What do Anthropic's current terms actually allow for running Claude Code headless (`claude -p`) on one Claude subscription (Pro/Max, or Team/Enterprise seat) to serve check requests clicked by other employees who have no Claude account — (a) logged in on the shared server, (b) logged in on one teammate's PC? Cite the Consumer Terms, Commercial Terms, Usage Policy and Claude Code docs (authentication / legal-and-compliance pages). Also: does a Team/Enterprise plan or any other Anthropic offering (short of a pay-per-token API key) legitimately cover this "one account serves the team" shape? Note the risk of each variant (account suspension, data use) and the quota facts that matter for a shared queue. Same short check for ChatGPT Plus/Pro + Codex CLI, since the user named GPT Pro too.

## Comments

Research: research/01-central-account-terms.md

## Answer

Not allowed, on either variant. Claude Code legal page: Anthropic does not allow anyone "to route requests through Free, Pro, or Max plan credentials on behalf of their users", enforceable without notice. Consumer Terms: may not "make your Account available to anyone else"; scripts only via API key. Usage Policy bans services "that route requests through consumer subscriptions". Team seat = "one named individual", limits per member. Sanctioned shared shapes are all pay-per-use (API key, Bedrock/Vertex/Foundry, gateway) or a sales agreement. OpenAI: same "make your account available" clause; only ChatGPT Enterprise has non-interactive tokens (blog claim about business accounts unverified). Quota: one SOC item ≈ 8–32% of a Pro 5-hour window. Detail and quotes: research/01-central-account-terms.md.
