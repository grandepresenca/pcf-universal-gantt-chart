# Standard: Software Engineering

General craft rules, framework-agnostic. Applies to all code in this repo.

## Change discipline
- **Smallest change that solves the problem.** No opportunistic refactors
  bundled into a feature or fix — they hide the real change in the diff and
  couple unrelated risk.
- **One reason to change per commit.** A reviewer should be able to state what
  a commit does in one sentence. If you can't, split it.
- **Every commit builds and passes the gate.** Never commit a knowingly-broken
  intermediate state on a shared branch.

## Naming and clarity
- Names state intent, not type or mechanism: `parentTaskId`, not `str2`.
- A function name is a promise; the body must keep it. If a function does more
  than its name says, either the name or the function is wrong.
- Prefer explicit over clever. Code is read far more than written; optimize for
  the reader six months from now who lacks today's context.

## Functions and structure
- A function does one thing at one level of abstraction. Mixing "fetch data",
  "transform it", and "render it" in one function is three functions.
- Keep cyclomatic complexity ≤ 10 and length ≤ ~40 lines (enforced by lint).
  A function that trips these is telling you it has more than one job.
- Pure functions wherever the logic allows: same input → same output, no side
  effects. Pure logic is trivially testable and reusable. Push side effects
  (I/O, DOM, network, Dataverse calls) to the edges; keep the core pure.
- Depend on abstractions, not concretions. Business logic should not reach
  directly into a framework object passed around everywhere — map it to an
  explicit typed shape at the boundary, then work with that.

## Error handling
- Never swallow errors. No empty catch. A caught error is logged, surfaced to
  the user, or rethrown — never silently dropped.
- Fail loud in development, degrade gracefully in production. A missing optional
  value should not crash the whole control; an unexpected state should be visible.
- Validate at the boundary. Data from outside (dataset, Web API, user config)
  is untrusted until checked. Inside the validated core, types can be trusted.
- Guard against the impossible-until-it-happens: null, undefined, empty
  collections, and — for anything recursive — cycles and unbounded depth.

## Comments and documentation
- Comment *why*, not *what*. The code says what; a comment earns its place by
  explaining a non-obvious reason, a tradeoff, or a link to an ADR.
- A `TODO` states who/when/why or links an issue. A bare `TODO: fix` is noise.
- When behaviour is subtle or was hard-won, a short comment saves the next
  person the investigation you just did.

## Testing
- Test behaviour, not implementation. A test should survive a refactor that
  preserves behaviour and fail on one that breaks it.
- Cover the edges, not just the happy path: empty, single, many, malformed,
  boundary values, and the failure modes above (null, cycle, missing ref).
- A bug fix starts with a failing test that reproduces the bug. If you can't
  reproduce it in a test, you don't yet understand it.
- Pure logic gets unit tests; that's the cheapest, highest-value coverage and
  the reason to keep logic pure in the first place.

## Dependencies
- Every dependency is a liability: supply-chain risk, maintenance, bundle size.
  Prefer the standard library and existing deps. Justify additions.
- Pin versions that ship to users. Know what lands in the production bundle
  versus what's build-only tooling — they have different risk profiles.

## Security (baseline; see also pcf.md)
- Never trust external input. Never build markup/queries by string
  concatenation from untrusted data.
- No secrets in source, config, logs, or commits. Ever.
- Least privilege: code and agents get the narrowest access that does the job.

## Performance
- Correctness first, then measure, then optimize. Don't guess at hot paths.
- But don't design in known-quadratic or unbounded work: a loop that re-scans
  a list per item, a render that rebuilds everything each frame, an
  unmemoized expensive computation on a hot path. Those are design errors, not
  premature optimization.
