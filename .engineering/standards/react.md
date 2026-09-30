# Standard: React

Applies to `.tsx` components. React 17 in this repo.

## Component responsibility
- A component either derives data or renders it — not both in bulk. Heavy
  computation (tree building, sorting, mapping a dataset) belongs in pure
  functions called by the component, not inline in JSX.
- Small, focused, named components over large anonymous ones. A named component
  (`TaskListTable`) shows up in stack traces and React DevTools; an anonymous
  one doesn't, and trips `react/display-name`.
- Presentational vs container: components that render should take data via
  props and stay ignorant of where it came from. Keep data-fetching and
  PCF/Dataverse access out of presentational components.

## Rendering correctness and cost
- **Do not create components inside render.** Defining a component (or calling a
  factory that returns one) during another component's render remounts it and
  its subtree every time — losing state and thrashing the DOM. Define
  components at module scope; compute values in render, not components.
  (This repo currently rebuilds the list/header/tooltip per render — a known
  item to fix with the feature work.)
- Memoize deliberately: `useMemo`/`useCallback` for expensive computations and
  for props passed to memoized children, not reflexively on everything.
  Unnecessary memoization adds noise and its own cost.
- Stable keys in lists: a key that identifies the item across renders (a record
  id), never the array index for data that reorders — index keys corrupt state
  on reorder.
- Derive, don't duplicate: state that can be computed from props/other state
  should be computed, not stored and kept in sync.

## Hooks
- Follow the rules of hooks (enforced by `react-hooks/rules-of-hooks`): only at
  the top level, never in conditions or loops.
- Keep effect dependency arrays honest. Don't silence
  `react-hooks/exhaustive-deps` by lying about deps; if an effect shouldn't
  re-run, restructure it so its real deps are stable.
- Clean up in effects and in the PCF `destroy`: listeners, timers,
  subscriptions. A component that adds a listener must remove it.

## Props and types
- Type props explicitly (no implicit `any` props). Optional props have sensible
  defaults; required props are required in the type.
- Prefer composition over deep prop-drilling or configuration flags. If a
  component sprouts many boolean props, it may be several components.
