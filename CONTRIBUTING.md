# Contributing

This file describes the process for contributing to `seda-evm-contracts`.

## Starting

First and foremost, [fork](https://github.com/sedaprotocol/seda-evm-contracts/fork) the repository. Then please read the
[developing instructions](DEVELOPING.md) for setting up your environment.

## Commits

Your commits must follow specific guidelines.

### Signed Commits

Sign all commits with a GPG key. GitHub has extensive documentation on how to:

- [Create](https://docs.github.com/en/authentication/managing-commit-signature-verification/generating-a-new-gpg-key)
  a new GPG key.
- [Add](https://docs.github.com/en/authentication/managing-commit-signature-verification/A-a-gpg-key-to-your-github-account)
  a GPG key to your GitHub.
- [Sign](https://docs.github.com/en/authentication/managing-commit-signature-verification/A-a-gpg-key-to-your-github-account)
  your commits.

### Convention

All commits are to follow the
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) standard.
Commit messages should always be meaningful.

## Getting Ready For a PR

This section describes actions to keep in mind while developing.

### Change Size

Unless there is no way to break up the changes, we will reject large PRs.

### Formatting and Cleanliness

Please ensure your code is formatted and the formatting tool gives no warnings.

## PRs

For creating the PR, please follow the instructions below.

1. Firstly, please open a
   [PR](https://github.com/SedaProtocol/seda-evm-contracts/compare) from your forked repo
   to the `main` branch of `seda-evm-contracts`.
2. Please fill in the PR template that is there.
3. Then assign it to yourself and anyone else who worked on the issue with you.
4. Make sure all CI tests pass.
5. Finally, please assign at least two of the following reviewers to your PR:
   - [FranklinWaller](https://github.com/FranklinWaller)
   - [gluax](https://github.com/gluax)
   - [jamesondh](https://github.com/jamesondh)
   - [mariocao](https://github.com/mariocao)
   - [mennatabuelnaga](https://github.com/mennatabuelnaga)
   - [Thomasvdam](https://github.com/Thomasvdam)
