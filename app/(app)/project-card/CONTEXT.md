# Project Card

This context catalogs the company's **signed-contract projects** into searchable summary records, so a project can be found by what it is and what it cost without browsing folders or opening files by hand. Its sources are the `Contract` and `Work Certificate` collections under the `PS` share's `_BID` area; the wider project archive is consulted only for a project's TOR, to write its Description.

## Language

**Project Card**:
A single searchable record summarizing one signed-contract project: client, project name, description, budget, year, and a path back to its files. One Project Code always produces exactly one card, however many contract, attachment, PO or certificate files that project has.
_Avoid_: Project record, entry, listing

**Project Code**:
The client-prefixed sequence number that identifies a project across the company's files (e.g. `NT004`, `PEA017`). It is the identity of a Project Card.
_Avoid_: Project ID, job number

**Contract**:
The agreement signed with the client for a project. Carries more detail about the work than a Work Certificate. A project has a Contract when its Project Code appears in the `Contract` collection.
_Avoid_: PO (a purchase order is a different, smaller document that sometimes stands in for one)

**Work Certificate**:
The letter (หนังสือรับรองผลงาน) issued by the client confirming ICN delivered a project. It is the authoritative source of a project's Budget. Not every project has one.
_Avoid_: Reference letter, completion letter

**Client**:
The organization a project's work was ultimately done for (its end owner), as an English code. On a subcontract, the party ICN directly contracted with follows in parentheses — e.g. `NBTC (TKC)`, `PEA (BBTEC)` — so a search or filter on either finds the card. When the end owner is unknown, the direct contracting party stands alone.
_Avoid_: Customer, organization, beneficiary

**Description**:
A short summary of a project's type of work and main system (e.g. "Teleprotection installation between substations A–B"), written in both Thai and English with the synonyms a user is likely to search for, so a query in either language can match. It is not a list of every work item; those are carried by Tags. Editable by hand. Always labelled with its Description Source.
_Avoid_: Summary, abstract, scope

**Description Source**:
Which material a Description was written from, in order of preference: the project's TOR, else ICN's Proposal, else its Contract, else only the project name and the card's own fields — or "edited by a person" once someone changes it by hand. Labelled on the card so a name-only Description is never mistaken for one read from documents. A Description (or Category/Tags/Work Types) edited by a person is never overwritten by a later push.
_Avoid_: Origin

**TOR**:
The client's terms of reference (ขอบเขตของงาน) for a project, found in that project's folder in the wider project archive, not under `_BID`. Used only as a Description Source; never a source of Budget.
_Avoid_: Spec, requirements, proposal

**Proposal**:
The bid document ICN submitted for a project (e.g. its `Proposal A` / Statement of Compliance folders), kept in the Project Folder. States what ICN offered to do, which can differ from what the client contracted, so it ranks below the TOR as a Description Source and is never treated as one.
_Avoid_: Bid, offer, TOR

**Category**:
The single main technology area a project is in, chosen from the company list that admins keep in Admin Center (e.g. IP Network, Transmission, Fiber Optic, Teleprotection). Every card has exactly one, so projects can be counted and grouped without overlap. Says what the project is about, never how the work was done — that is its Work Type.
_Avoid_: Type, group, project type

**Tag**:
Any further technology area a project includes besides its Category, from the same list (e.g. an IP Network project that also lays Fiber Optic). A card has zero or more.
_Avoid_: Label, keyword, sub-category

**Work Type**:
How ICN delivered a project, from a short company list admins keep in Admin Center (to start: supply, installation, MA, managed services, rental, system development). A card has one or more (e.g. supply + installation + MA).
_Avoid_: Service type, contract type

**Project Folder**:
The project's own folder in the wider project archive (`_Project …` on the `PS` share), where its TOR and other working files live. A third Folder Path on the card besides the Contract and Work Certificate paths; blank when the project has no folder there, or when no single folder can be identified with confidence — blank, never a guess.
_Avoid_: Archive path, TOR path

**Budget**:
A project's monetary value, AI-extracted from its Work Certificate. When a project has no Work Certificate, the value stated in its Contract is used instead and the card labels the Budget's source as the Contract, so a certificate figure and a contract figure are never presented as the same kind of number. Left blank, never guessed, when no figure at all can be found in the source document. When the only figure found is a joint/combined total (e.g. a consortium's whole contract value) rather than ICN's own isolated share, that total is still used as the Budget — never left blank just because it isn't ICN-specific — with a Budget Note stating plainly that no ICN-only breakdown was found. Carries an `unverified` flag until a person confirms it, and is never presented as authoritative before that.
_Avoid_: Cost, price, value

**VAT Status**:
Whether a Budget figure includes VAT, excludes it, or the source document doesn't say. Recorded exactly as the document states it and never normalized across projects, since not every document names a VAT rate and converting would invent a number that isn't in the source.
_Avoid_: Tax status, VAT flag

**Budget Note**:
A short free-text remark attached to a Budget that a single number can't express: a joint-venture project's total contract value alongside the smaller ICN-only share actually used as the Budget, a subcontract's payer/beneficiary context, or the reason no figure was found.
_Avoid_: Comment, remark

**Year**:
The year a project's Contract was signed — not its delivery/acceptance date or the date a Work Certificate was issued, since those can trail signing by years and aren't reliably present on every project. Read from whichever document, Contract or Work Certificate, states it.
_Avoid_: Fiscal year, contract year

**Superseding Version**:
When a project's Contract or Work Certificate collection holds multiple documents and one explicitly states it replaces an earlier one (e.g. a version marked "ออกทดแทน" the original), that document is used as the source of truth and the one it replaces is not. When no document states such a relationship, the multiple versions are surfaced for a person to pick instead — never guessed.
_Avoid_: Revision, amendment, latest version

**Folder Path**:
The UNC path back to a project's files on the `PS` share, kept on the Project Card so a user can navigate to the originals by hand. A card carries up to three: one for the project's Contract and one for its Work Certificate under `_BID`, since the two live in different places, plus its Project Folder; each is blank when the project has no such file or folder. Search inside the files themselves is explicitly out of scope (see ADR 0003).
_Avoid_: Location, share path
