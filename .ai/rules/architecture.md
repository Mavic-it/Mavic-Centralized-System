# Architecture Rules

- Respect boundaries between `application/web`, `application/api`, and `packages`.
- Prefer small modules, explicit contracts, dependency inversion, and composition.
- Keep domain logic independent from transport, UI, and persistence details.
- Make side effects explicit, idempotent where retried, observable, and recoverable.
- Prefer additive API and schema evolution; document breaking changes and rollout order.
- Do not introduce infrastructure or abstractions without a current, testable requirement.
