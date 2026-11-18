# [0.7.0](https://github.com/MarvinRF/docfy-core/compare/v0.6.2...v0.7.0) (2026-11-18)


### Features

* **contract-test:** fire only safe methods and restrict baseUrl by default ([68f00f4](https://github.com/MarvinRF/docfy-core/commit/68f00f4fd8f35ca13fe1269900743cffbdfd3246))


### BREAKING CHANGES

* **contract-test:** runContractTests no longer fires POST/PUT/PATCH/DELETE
by default; pass allowWrites: true to restore it. A non-loopback baseUrl
outside the spec's servers now throws unless restrictToServers: false.
EndpointTestOutcome gains the skipped-unsafe-method variant. Node.js
22.12+ is required.

157 tests passing.

## [0.6.2](https://github.com/MarvinRF/docfy-core/compare/v0.6.1...v0.6.2) (2026-11-18)


### Bug Fixes

* **deps:** refresh lockfile for fast-uri and js-yaml advisories ([c985627](https://github.com/MarvinRF/docfy-core/commit/c985627768dd5fce7a1fbc5c01fd4ff31fb3aef7)), closes [hi#severity](https://github.com/hi/issues/severity)

## [0.6.1](https://github.com/MarvinRF/docfy-core/compare/v0.6.0...v0.6.1) (2026-08-07)


### Bug Fixes

* **deps:** bump fast-uri and js-yaml, 2 high-severity CVEs ([c0a274a](https://github.com/MarvinRF/docfy-core/commit/c0a274a598dc838674ff116430a6e6a23366fe74)), closes [hi#severity](https://github.com/hi/issues/severity)
* SECURITY.md formatting ([89b68da](https://github.com/MarvinRF/docfy-core/commit/89b68da1c5079bf0b99b041fddfa6f6a77ba176e))

# [0.6.0](https://github.com/MarvinRF/docfy-core/compare/v0.5.0...v0.6.0) (2026-08-06)


### Features

* add runContractTests() and allowed-origins helpers ([4908453](https://github.com/MarvinRF/docfy-core/commit/49084532a11e3121370e1941f5912fde395beab8))

# [0.5.0](https://github.com/MarvinRF/docfy-core/compare/v0.4.0...v0.5.0) (2026-07-31)


### Features

* add lintSpec() — OpenAPI spec quality governance checks ([0e4d5b1](https://github.com/MarvinRF/docfy-core/commit/0e4d5b188b282578f42a686863b3355d5005dcb4))

# [0.4.0](https://github.com/MarvinRF/docfy-core/compare/v0.3.0...v0.4.0) (2026-07-31)


### Features

* add validateAgainstSchema() and llms.txt/llms-full.txt serializers ([b4fb63f](https://github.com/MarvinRF/docfy-core/commit/b4fb63fa7c2b78e6e97ba4f694341754b94cbbf4))

# [0.3.0](https://github.com/MarvinRF/docfy-core/compare/v0.2.0...v0.3.0) (2026-07-30)


### Features

* add diffDocuments() — spec diffing with breaking-change detection ([f13a85f](https://github.com/MarvinRF/docfy-core/commit/f13a85f2962c19a53c40f7ca98395d9385b49dc4))
