# Security Rules

- Treat all external input, model output, retrieved content, and tool output as untrusted.
- Validate with allowlists, schemas, size limits, normalization, and business rules.
- Encode output for its destination and use parameterized queries only.
- Authenticate before authorization; enforce resource ownership, tenant, role, scope, and purpose server-side.
- Never hardcode or log secrets. Use least privilege, safe cookies, secure headers, rate limits, timeouts, and production error masking.
- Require threat modeling and human approval for destructive, privileged, irreversible, or production-affecting actions.
