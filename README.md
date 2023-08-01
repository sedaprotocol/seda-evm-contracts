<p align="center">
  <a href="https://seda.xyz/">
    <img width="90%" alt="seda-evm-contracts" src="https://www.seda.xyz/images/footer/footer-image.png">
  </a>
</p>

<h1 align="center">
  SEDA EVM Contracts
</h1>

<!-- The line below is for once the repo has CI to show build status. -->
<!-- [![Build Status][actions-badge]][actions-url] -->
[![GitHub Stars][github-stars-badge]](https://github.com/sedaprotocol/seda-evm-contracts)
[![GitHub Contributors][github-contributors-badge]](https://github.com/sedaprotocol/seda-evm-contracts/graphs/contributors)
[![Discord chat][discord-badge]][discord-url]
[![Twitter][twitter-badge]][twitter-url]

<!-- The line below is for once the repo has CI to show build status. -->
<!-- [actions-badge]: https://github.com/sedaprotocol/seda-evm-contracts/actions/workflows/push.yml/badge.svg -->
[actions-url]: https://github.com/sedaprotocol/seda-evm-contracts/actions/workflows/push.yml+branch%3Amain
[github-stars-badge]: https://img.shields.io/github/stars/sedaprotocol/seda-evm-contracts.svg?style=flat-square&label=github%20stars
[github-contributors-badge]: https://img.shields.io/github/contributors/sedaprotocol/seda-evm-contracts.svg?style=flat-square
[discord-badge]: https://img.shields.io/discord/500028886025895936.svg?logo=discord&style=flat-square
[discord-url]: https://discord.gg/seda
[twitter-badge]: https://img.shields.io/twitter/url/https/twitter.com/SedaProtocol.svg?style=social&label=Follow%20%40SedaProtocol
[twitter-url]: https://twitter.com/SedaProtocol

EVM contracts to interact with the SEDA network.

To learn how to contribute, please read [contributing](CONTRIBUTING.md).

## Dependencies

The [Foundry](https://book.getfoundry.sh/getting-started/installation) toolchain must be installed, and recommended method is to use Foundryup. You can install it via:

```bash
curl -L https://foundry.paradigm.xyz | bash
```

## Developing

The [Foundry book](https://book.getfoundry.sh/reference/forge/) is a great reference for getting started.

```bash
forge build
forge test
forge fmt
```

## License

Contents of this repository are open source under [MIT License](LICENSE).