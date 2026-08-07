# Security Policy

## Supported Versions

Only the latest published version of `docfy-core` receives security fixes.
There's no LTS branch — this package follows `semantic-release`, and fixes
ship as a new patch/minor release rather than being backported to older
versions.

| Version  | Supported |
| -------- | --------- |
| latest   | ✅        |
| < latest | ❌        |

## Reporting a Vulnerability

Please report security vulnerabilities privately, not in a public issue.

Use GitHub's [private vulnerability reporting](https://github.com/MarvinRF/docfy-core/security/advisories/new)
for this repository — it goes directly to the maintainer, not a public thread.

You should get an initial response within a few days. This project is
maintained by a single person, not a team — treat that as a realistic
expectation, not an SLA.

## Scope

**In scope**: vulnerabilities in this package's own code — the document-model
helpers (`normalize`, `example`, `diff`, `lintSpec`, `runContractTests`,
`validateAgainstSchema`, etc.) and the published npm artifact.

**Out of scope**: vulnerabilities in the OpenAPI documents you pass into
these functions (that's your data, not this package's code), and
vulnerabilities in third-party dependencies (report those upstream — the fix
lands here on the next `npm audit`/Dependabot pass, already run in CI on
every push).
