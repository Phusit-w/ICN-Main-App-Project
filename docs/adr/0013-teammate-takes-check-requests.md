# A user without Claude asks a teammate to take the request; no central account, no automatic take

Decided 2026-10-29 (`.scratch/proposal-steps/issues/05-central-account-design.md`); amends ADR 0008.

ADR 0008 lets only the clicking reviewer's SOC Runner take a Check Request, so a user without a Claude subscription can't use the AI steps of a Proposal. The user first wanted a central Claude account — logged in on the server or on one teammate's PC — taking everyone's requests automatically. Research (`.scratch/proposal-steps/research/01-central-account-terms.md`) found Anthropic's terms forbid exactly that: Anthropic does not allow anyone "to route requests through Free, Pro, or Max plan credentials on behalf of their users", the Usage Policy bans services "that route requests through consumer subscriptions", and a Team seat is "for one named individual". Code that clicks "take" for the account owner is the same thing.

So a Check Request belongs to whoever runs it. A user with a SOC Runner runs their own (and may still ask for help, e.g. when their quota is out). A user without one sends it to **รอคนรับ**: any user with an active Runner Link sees the waiting requests and takes one — or a whole-SOC set — by their own click, after a popup saying it uses their quota. It then runs on the taker's Runner under the taker's login, and the result records both names ("ขอโดย ก · ตรวจโดย ข"). Nothing ever takes a request automatically. This reads as a teammate doing the work under their own account; Anthropic's terms don't name it as allowed, but it is far from the forbidden shape.

## Considered Options

- **Central account on the server or a teammate's PC taking requests automatically** (or a script clicking take): forbidden by the terms above; risks suspension without notice and puts every project's files in one account's history.
- **Company-paid Claude Team seats**: within the terms, no code change; the long-term answer if รอคนรับ becomes a bottleneck.
- **Pay-per-use API key on the server**: within the terms and automatic, rejected again for cost (as in ADR 0008).
- **Gemini CLI free tier**: separate effort; Google may use the data.

## Consequences

- The claim rule in `lib/soc-check-requests.ts` (`CLAIMABLE`, `claimedRequest`) gains a second path: a request taken by a user is claimable by that taker's Runner only.
- Requester may cancel any time before the run starts; requests never expire; a taker's Runner gone quiet for 2 minutes puts the request back into รอคนรับ.
- Waiting requests show as a count on the SOC menu for users with a Runner; in-app only, no email.
- No ADMIN grant is needed: anyone with a Runner may take, anyone may ask.
