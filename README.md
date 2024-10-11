<p align="center">
  <a href="https://seda.xyz/">
    <img width="90%" alt="seda-evm-contracts" src="https://www.seda.xyz/images/footer/footer-image.png">
  </a>
</p>

<h1 align="center">
  SEDA EVM Contracts
</h1>

[![GitHub Stars][github-stars-badge]](https://github.com/sedaprotocol/seda-evm-contracts)
[![GitHub Contributors][github-contributors-badge]](https://github.com/sedaprotocol/seda-evm-contracts/graphs/contributors)
[![Discord chat][discord-badge]][discord-url]
[![Twitter][twitter-badge]][twitter-url]

[actions-url]: https://github.com/sedaprotocol/seda-evm-contracts/actions/workflows/push.yml+branch%3Amain
[github-stars-badge]: https://img.shields.io/github/stars/sedaprotocol/seda-evm-contracts.svg?style=flat-square&label=github%20stars
[github-contributors-badge]: https://img.shields.io/github/contributors/sedaprotocol/seda-evm-contracts.svg?style=flat-square
[discord-badge]: https://img.shields.io/discord/500028886025895936.svg?logo=discord&style=flat-square
[discord-url]: https://discord.gg/seda
[twitter-badge]: https://img.shields.io/twitter/url/https/twitter.com/SedaProtocol.svg?style=social&label=Follow%20%40SedaProtocol
[twitter-url]: https://twitter.com/SedaProtocol

## Overview

This repository contains smart contracts that enable interaction between Ethereum Virtual Machine (EVM) compatible blockchains and the SEDA network. The contracts facilitate cross-chain communication by:

1. Handling requests from EVM chains to the SEDA network
2. Managing results returned from the SEDA network
3. Verifying proofs from the SEDA network

These contracts provide the necessary infrastructure for developers to integrate SEDA's functionality into their EVM-based applications, enabling cross-chain data processing and computation.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (latest version)

### Dependencies

This project relies on the following dependencies:

- Development dependencies (listed in `package.json`)
- [@openzeppelin/contracts](https://github.com/OpenZeppelin/openzeppelin-contracts) (version 5.0.2) for ECDSA and Merkle Tree verifications


### Installation

1. Clone the repository:
   ```
   git clone https://github.com/sedaprotocol/seda-evm-contracts.git
   ```

2. Navigate to the project directory:
   ```
   cd seda-evm-contracts
   ```

3. Install dependencies:
   ```
   bun install
   ```
   
### Development

Dive into the development process with these easy-to-use commands:

1. Compile contracts:
   ```
   bun run compile
   ```

2. Run tests:
   ```
   bun test
   ```

3. Run tests with gas reporting:
   ```
   bun run test:gas
   ```

4. Lint Solidity files:
   ```
   bun run lint:sol
   ```

5. Lint TypeScript files:
   ```
   bun run lint:ts
   ```

> [!TIP]
> Don't forget to set up your `.env` file with the necessary environment variables before deploying or interacting with live networks!

## License

Contents of this repository are open source under [MIT License](LICENSE).
