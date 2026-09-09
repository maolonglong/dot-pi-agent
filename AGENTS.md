## Communication

- Respond in Simplified Chinese. Use English for identifiers, code comments, and API documentation.
- Be concise, direct, and execution-focused.

## Design

- Prefer simple solutions with small APIs and explicit behavior. Add abstractions, layers, or dependencies only for concrete needs.
- Extract shared code when cases share the same semantics and are likely to evolve together, not merely because their implementations look alike.
- Use comments for non-obvious rationale, invariants, safety constraints, and external quirks. Document public APIs by their observable contracts.

## Validation

- Choose validation scope by risk, using the project's existing test conventions. Cover meaningful behavior, regressions, non-trivial invariants, and critical boundaries.
- Test observable behavior rather than implementation details. Treat coverage as a gap signal, not proof of quality or a reason to add tests.
- For concurrency tests, use deterministic coordination or controlled scheduling rather than sleeps.
