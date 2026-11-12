# Coding Style Rules

- Follow existing package scripts, TypeScript configuration, lint rules, and framework conventions.
- Use strict types and validate all external data at trust boundaries.
- Keep functions focused and names explicit; avoid `any`, unsafe casts, and hidden global state.
- Preserve unrelated changes and avoid broad formatting churn.
- Prefer readable code over clever code. Add comments only for non-obvious constraints or invariants.
- Add tests with behavior changes and run focused validation immediately after edits.
