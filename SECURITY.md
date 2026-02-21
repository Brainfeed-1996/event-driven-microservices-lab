# Security Policy

## Supported Versions

This repository is actively maintained on the `main` branch.

## Reporting a Vulnerability

Please do **not** open public GitHub issues for security problems.

1. Create a private report via GitHub Security Advisories.
2. Include impact, reproduction steps, and affected component(s).
3. If possible, provide a minimal proof of concept and suggested mitigation.

We will acknowledge receipt within 72 hours and provide remediation status updates.

## Secure Development Baseline

- No secrets committed to source control.
- Principle of least privilege for service credentials.
- Dependency updates and CI checks required before merge.
- Contract tests must pass for event-schema changes.
