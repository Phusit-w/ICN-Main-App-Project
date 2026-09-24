# Project Card

This context catalogs the company's **signed-contract projects** into searchable summary records, so a project can be found by what it is and what it cost without browsing folders or opening files by hand. Its sources are the `Contract` and `Work Certificate` collections under the `PS` share's `_BID` area; the wider project archive is no longer a source.

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
The organization a project was done for, derived from the project's position in the share's folder hierarchy — always the party ICN directly contracted with, even on a subcontract where the work ultimately serves a different beneficiary through that party (e.g. Client `TKC` on a project performed for NBTC's benefit). The beneficiary still belongs in the Project Card's project name, so a search for either party finds the card.
_Avoid_: Customer, organization, end beneficiary

**Description**:
A short, AI-generated summary of what a project does, written in both Thai and English so a query in either language can match. Editable by hand after generation. Blank (not an error) until an AI provider is approved and wired up — the crawler ships with one disabled by default, same fail-closed convention as SOC's document analysis.
_Avoid_: Summary, abstract

**Budget**:
A project's monetary value, AI-extracted from its Work Certificate. When a project has no Work Certificate, the value stated in its Contract is used instead and the card labels the Budget's source as the Contract, so a certificate figure and a contract figure are never presented as the same kind of number. Left blank, never guessed, when no figure can be found in the source document. Carries an `unverified` flag until a person confirms it, and is never presented as authoritative before that.
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
The UNC path back to a project's files on the `PS` share, kept on the Project Card so a user can navigate to the originals by hand. A card carries up to two: one for the project's Contract and one for its Work Certificate, since the two live in different places; either is blank when the project has no such file. Search inside the files themselves is explicitly out of scope (see ADR 0003).
_Avoid_: Location, share path
