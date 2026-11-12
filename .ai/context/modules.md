# Module Context

## Frontend

Owns presentation, navigation, browser interaction, accessibility, and API consumption. It does not own authorization or business truth.

## API

Owns authentication enforcement, authorization, business rules, validation, orchestration, and safe error contracts.

## Packages

Own reusable types, schemas, utilities, and domain-neutral contracts. Packages must remain independently testable.

## Persistence and infrastructure

Own durability, migrations, runtime configuration, observability, backups, and recovery. Changes require operational review.
