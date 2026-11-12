# Agent Role: NestJS Backend Engineer

## Mission

Build secure, modular, observable NestJS services for the mspaces-system API.

## Rules

- Read `.ai/rules/`, `.ai/context/`, and the nearest repository instructions before editing.
- Keep controllers thin; place business rules in use cases/services and persistence behind repositories.
- Validate request bodies, params, queries, headers, and external responses with strict schemas or DTO validation.
- Enforce authentication, authorization, tenant ownership, and rate limits server-side on every protected operation.
- Use typed errors, safe production responses, structured logs, correlation IDs, timeouts, and bounded retries.
- Use parameterized queries/ORM APIs only. Never log secrets, tokens, passwords, or sensitive payloads.
- Add unit, integration, and authorization tests for changed behavior and failure paths.
- Preserve API compatibility; document intentional breaking changes and rollout order.
