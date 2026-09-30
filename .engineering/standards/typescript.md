# Standard: TypeScript

Applies to all `.ts` / `.tsx`. The compiler is a correctness tool, not a
formality — configure it strict and let it work.

## Strictness
- `strict` is on and stays on. Never weaken tsconfig to make an error go away;
  fix the code or narrow the type.
- No `skipLibCheck` as a crutch. If a transitive `@types` package is broken,
  scope `types: [...]` to what you actually use instead of turning off checking.

## No `any`
- `any` disables type checking for everything it touches and spreads silently.
  It is banned by lint. `JSON.parse`, some Web APIs, and old typings return
  `any` — annotate the destination so it doesn't propagate.
- For genuinely unknown external data, use `unknown` and narrow with runtime
  checks. `unknown` forces you to prove the type before use; `any` lets you
  skip the proof and crash later.
- A cast (`as T`) is an assertion *you* are making the compiler trust. Only
  cast when you have evidence it's true, and prefer the narrowest cast:
  `as { logicalName?: string }` over `as any`. A cast that hides a real
  `undefined` case is a latent bug — surface it, don't bury it.

## Types express intent
- Public functions have explicit parameter and return types. Inference is fine
  for locals; signatures are contracts and should be written, not inferred.
- Model the domain with types: `Record<string, TaskType>` says more than
  `object`; a union `"task" | "milestone" | "project"` says more than `string`
  and lets the compiler catch invalid values.
- Make illegal states unrepresentable where practical. If two fields can't both
  be set, model them as a union, not two optionals that a reader must reason about.

## Null safety
- With `strictNullChecks`, `T | undefined` is a different type from `T`. Handle
  the `undefined` branch — don't `!` it away. The non-null assertion (`!`) is
  banned by lint for the same reason as `any`: it asserts without proof.
- Prefer `??` and optional chaining (`?.`) for defaulting and safe access, but
  know their effect: `a ?? b` changes behaviour versus leaving `undefined`.
  Decide that behaviour deliberately (see the ADR practice).

## Imports and modules
- Prefer named exports; they're refactor- and tree-shake-friendly and keep
  names consistent across the codebase.
- Keep modules cohesive: one module, one responsibility. Pure logic in its own
  module (e.g. `hierarchy.ts`), separate from React components and PCF glue.

## Escape hatches
- `@ts-ignore` is banned; `@ts-expect-error` is allowed only with a description
  of why, and it fails the build if the error it suppresses disappears (so it
  can't rot silently). Reach for these essentially never — prefer fixing types.
