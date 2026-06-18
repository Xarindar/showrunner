  !--
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  AGENT INSTRUCTIONS — READ YOUR ROLE ONLY, THEN STOP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The user will assign you one of the roles below. Read that
section only. Do not read the others — skipping them is
not laziness, it is correct behavior that keeps token usage
lean and your focus sharp.

Roles: ENGINEER · LINTER · REVIEWER · PATCHER · VALIDATOR

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SHARED RULES — ALL ROLES MUST INTERNALIZE THESE FIRST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MODULAR DESIGN IS THE PRIME DIRECTIVE.
This project is built to be modular. Every piece of work
you produce must respect that. This is non-negotiable.

Before creating anything new:
  1. Look for an existing resource that already does the job.
  2. If one exists — use it. Always. A working existing
     resource beats a new one unless using it would
     meaningfully degrade the user experience.
  3. If nothing suitable exists, create the new resource
     so it can be shared. Place it with like resources.
     Name it clearly. Build it to be reused, not used once.

Never:
  - Duplicate logic that already exists elsewhere
  - Create a new endpoint, action, component, or utility
    in isolation when a home for it already exists
  - Use AI-sounding names (e.g. SmartHandler, AIProcessor,
    IntelligentForm) — name things plainly and accurately

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ROLE: ENGINEER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your job is to implement the milestone or task the user
points you to in this document.

Build it:
  - To high, production-quality standards
  - Following the Shared Rules above without exception
  - Consistent with the patterns already established in
    the codebase — if something is done a certain way
    elsewhere, match it

When you are done, mark your work in the roadmap inline
by appending the following block directly beneath the
relevant bullet or section:

  > **🛠 ENGINEER · [date]:** [Brief summary of what was
  > built, key files/locations touched, and any decisions
  > worth calling out for the next role.]
  >
  > **Status: `READY-FOR-AUDIT`**

Do not self-approve. Do not move the status forward.
Your job ends at READY-FOR-AUDIT.

Before marking READY-FOR-AUDIT, commit your work:
  - Stage only the files relevant to this task
  - Write a clear, descriptive commit message that explains
    what was built and why — not just what files changed
  - Do not add Co-authored-by lines or any AI attribution
    to the commit

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ROLE: LINTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your job is to audit all items currently marked
`READY-FOR-AUDIT` in this document.

For each item, examine the implementation and verify it
against the Shared Rules. Flag issues by severity:

  🔴 Critical — broken, insecure, or blocks other work
  🟠 Significant — wrong pattern, duplication, or a choice
     that will cause pain later
  🟡 Minor — naming, inconsistency, or a missed polish item

Also: if you encounter something clearly broken or badly
misaligned that is NOT tagged for audit, note it in a
brief sidebar — do not let it derail your audit, but do
not silently ignore it either.

When done, append inline beneath the item:

  > **🔍 LINTER · [date]:** [Findings in priority order.
  > Each finding references the exact file and line where
  > possible. Be specific — the Patcher will work from this.]
  >
  > **Status: `READY-FOR-REVIEW`**

Do not propose fixes. Do not implement anything.
Your job is to see clearly and report accurately.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ROLE: REVIEWER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your job is to sanity-check all items marked
`READY-FOR-REVIEW` in this document.

Read the Linter's findings. Then look at the code yourself.
You are not rubber-stamping — you are a second set of eyes.

You will do one of two things:

  APPROVE — The Linter's findings are accurate and complete.
  Nothing significant was missed. Append:

    > **✅ REVIEWER · [date]:** Findings confirmed. No gaps.
    >
    > **Status: `APPROVED-FOR-PATCH`**

  FLAG — The Linter missed something, overstated something,
  or a finding doesn't align with project direction. Append:

    > **⚠️ REVIEWER · [date]:** [What was missed or
    > mis-called, with file/line references. Be direct.]
    >
    > **Status: `READY-FOR-REVIEW`** ← returns to Linter

Do not implement fixes. Do not approve work you have doubts
about to keep things moving — a flag now is cheaper than a
bad patch later.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ROLE: PATCHER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your job is to fix all items marked `APPROVED-FOR-PATCH`
in this document.

Work from the Linter's findings and the Reviewer's
confirmation. Fix every flagged issue. Follow the Shared
Rules — if a fix requires a new resource, make sure it
lives in the right place and is built to be reused.

When done, append inline beneath the item:

  > **🔧 PATCHER · [date]:** [What was fixed, file by file.
  > Reference the finding it addresses. Note any edge cases
  > or follow-up concerns.]
  >
  > **Status: `READY-FOR-CONFIRM`**

Do not mark your own work confirmed.
Do not skip a finding because it seems minor.

Before marking READY-FOR-CONFIRM, commit your work:
  - One commit per logical fix where possible — do not
    bundle unrelated changes
  - Write a clear commit message that references what was
    patched and which finding it addresses
  - Do not add Co-authored-by lines or any AI attribution
    to the commit

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ROLE: VALIDATOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your job is to confirm all items marked `READY-FOR-CONFIRM`
in this document.

Check the Patcher's work against every finding the Linter
raised. Verify the fix is actually in the code — with file
and line references. Do not take the Patcher's word for it.

If everything checks out, append:

  > **✅ VALIDATOR · [date]:** [Confirmed fixes, each
  > referenced by file and line. Note any residual concerns
  > or forward-looking callouts for future work.]
  >
  > **Status: `CONFIRMED`**

If something wasn't actually fixed or introduced a new
problem, append:

  > **🔴 VALIDATOR · [date]:** [What is still broken or
  > newly broken, with references.]
  >
  > **Status: `READY-FOR-PATCH`** ← returns to Patcher

You are the last gate. Be thorough.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  STATUS FLOW (reference)

  READY-FOR-AUDIT
    → READY-FOR-REVIEW     (Linter done)
    → APPROVED-FOR-PATCH   (Reviewer approved)
    → READY-FOR-CONFIRM    (Patcher done)
    → CONFIRMED            (Validator done)

  Loop-backs:
    READY-FOR-REVIEW       (Reviewer flagged gaps → Linter)
    READY-FOR-PATCH        (Validator found failures → Patcher)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-->

**Lifecycle:** `⬜ PENDING → 🔵 READY-FOR-AUDIT → 🔍 AUDITED → 🛠 RESOLVED → ✅ CONFIRMED`, with `⚠️ FLAGGED` as the branch for an audited/resolved item that still has an open blocker or a fix that did not fully land.

| Token | State | Meaning |
|---|---|---|
| `⬜ PENDING` | not built | specced only; schema and/or UI absent |
| `🔵 READY-FOR-AUDIT` | built, unaudited | implementer marked it ready; awaiting an audit pass |
| `🔍 AUDITED` | findings recorded | an AUDIT block exists; fixes not yet applied or incomplete |
| `🛠 RESOLVED` | fixes applied | implementer addressed findings; awaiting re-verification |
| `✅ CONFIRMED` | verified | auditor re-checked the code and the fix holds |
| `⚠️ FLAGGED` | needs rework | open blocker, regression, or a resolution that did not fully land |

**Finding severity** (used inside 🔍 AUDIT blocks): `🔴 BLOCKER` · `🟠 HIGH` · `🟡 MEDIUM` · `🟢 LOW`.

**Log block format** — one line per lifecycle step under the item, oldest first:

```
> **🔍 AUDIT · <author> [MM-DD-YY]:** findings, each tagged 🔴/🟠/🟡/🟢 with file:line + fix.
> **🛠 RESOLVED · <author> [MM-DD-YY]:** what changed.
> **✅ CONFIRMED · <author> [MM-DD-YY hh:mm TZ]:** what was re-verified in code (file:line).
> **⚠️ FLAG · <author> [MM-DD-YY hh:mm TZ]:** what is still wrong or not covered.
```

Grep targets: `🔍 AUDIT`, `🛠 RESOLVED`, `✅ CONFIRMED`, `⚠️ FLAG`, or any severity emoji. Full audits that live in their own file are linked from the Status Index.

> Legacy inline phrases ("ready for audit", "waiting for audit", "audited 06-06-26") predate this protocol and are descriptive only — trust the Status Index token and the log blocks over them.