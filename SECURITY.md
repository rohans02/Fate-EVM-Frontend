# Security Policy

## Supported Versions

Fate Protocol's EVM frontend is continuously deployed: a merge to `main` publishes to GitHub Pages,
and there are no tagged releases. Security fixes therefore target the latest `main`, and users always
receive the current deployment.

The protocol's smart contracts live in a separate repository. If a report concerns on-chain
behaviour rather than the interface, please say so and the maintainers will route it.

## Reporting a Vulnerability

Please do not disclose security vulnerabilities through public GitHub issues, pull requests, or
public Discord channels.

For security-sensitive reports, contact a project maintainer privately. Maintainers are listed in
[MAINTAINERS.md](MAINTAINERS.md) and can be reached by direct message on the
[Stability Nexus Discord server](https://discord.gg/hjUhu33uAn).

A vulnerability report should include, where possible:

- the affected component, page, or contract
- the affected commit, or the date you observed the behaviour on the deployed site
- a description of the vulnerability and its impact
- steps to reproduce the issue
- a proof of concept, if available
- any suggested mitigation

Please avoid publicly sharing exploit details until the maintainers have had an opportunity to
investigate and address the issue.

Maintainers aim to acknowledge security reports within 14 days, and will coordinate remediation and
disclosure with the reporter where appropriate.

## Scope

This repository is a statically exported browser client. It has no server runtime, no API routes,
and no user accounts or credential storage. Private keys never reach it: transaction signing is
delegated entirely to the user's wallet.

Reports most relevant to this repository include anything that could cause a user to sign a
transaction they did not intend, misrepresent on-chain state in a way that changes a trading
decision, or introduce untrusted content into the interface.

Issues in third-party wallets, RPC providers, or upstream dependencies should be reported to those
projects directly. If a dependency vulnerability affects Fate specifically, please tell us as well.

## Non-Security Bugs

Non-security bugs and feature requests should continue to be reported through the project's
[GitHub Issues](https://github.com/StabilityNexus/Fate-EVM-Frontend/issues).
