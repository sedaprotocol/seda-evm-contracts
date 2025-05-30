<p align="center">
  <a href="https://seda.xyz/">
    <img width="90%" alt="seda-evm-contracts" src="https://raw.githubusercontent.com/sedaprotocol/.github/refs/heads/main/images/banner.png">
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

These contracts provide the necessary infrastructure for developers to integrate SEDA's functionality into their EVM-based applications, facilitating cross-chain data processing and computation.

**[Read more about the architecture](docs/ARCHITECTURE.md)**

## Architecture

The SEDA EVM Contracts enable interaction with the SEDA network through two main components:

### Core Components

1. **SedaCore (SedaCoreV1)**
   - Manages the lifecycle of data requests and results
   - Inherits from `RequestHandlerBase` and `ResultHandlerBase` for request and result management
   - Uses the FeeManager from the Prover contract for fee distribution

2. **Secp256k1Prover (Secp256k1ProverV1)**
   - Proves results by cryptographically verifying batches from the SEDA network
   - Requires 66.67% validator consensus
   - Maintains reference to the FeeManager used by core contracts

3. **SedaFeeManager**
   - Implements pull-based withdrawal system for fees
   - Manages request fees, result fees, and batch fees
   - Provides secure withdrawal mechanism for recipients
   - Shared between Core and Prover contracts for consistent fee management

### Key Interfaces

1. **ISedaCore**
   ```solidity
   interface ISedaCore is IResultHandler, IRequestHandler {
       // Posts a new request with specified fees.
       function postRequest(
           SedaDataTypes.RequestInputs calldata inputs,
           uint256 requestFee,
           uint256 resultFee,
           uint256 batchFee
       ) external payable returns (bytes32);

       // Increases fees for an existing request.
       function increaseFees(
           bytes32 requestId,
           uint256 additionalRequestFee,
           uint256 additionalResultFee,
           uint256 additionalBatchFee
       ) external payable;

       // Retrieves pending requests with pagination.
       function getPendingRequests(uint256 offset, uint256 limit) 
           external view returns (Request[] memory);
   }
   ```

2. **IProver**
   ```solidity
   interface IProver {
       // Posts a new batch with signatures and proofs.
       function postBatch(
           SedaDataTypes.Batch calldata newBatch,
           bytes[] calldata signatures,
           SedaDataTypes.ValidatorProof[] calldata validatorProofs
       ) external;

       // Verifies a result proof with a Merkle proof.
       function verifyResultProof(
           bytes32 resultId,
           uint64 batchHeight,
           bytes32[] calldata merkleProof
       ) external view returns (bool, address);

       // Gets the height of the last batch.
       function getLastBatchHeight() external view returns (uint64);
   }
   ```

3. **IFeeManager**
   ```solidity
   interface IFeeManager {
       // Adds fees to recipient's pending balance
       function addPendingFees(address recipient) external payable;
       
       // Adds fees for multiple recipients
       function addPendingFeesMultiple(
           address[] calldata recipients, 
           uint256[] calldata amounts
       ) external payable;
       
       // Withdraws accumulated fees
       function withdrawFees() external;
       
       // Gets pending fee balance
       function getPendingFees(address account) external view returns (uint256);
   }
   ```

### Data Flow

1. **Request Flow**
   - Users submit requests through `SedaCore.postRequest()` with associated fees
   - Requests are stored and tracked in pending state
   - Each request includes execution and tally parameters
   - **Incentives**: Users attach fees which are initially held by the Core contract:
     - `requestFee`: For forwarding requests to the SEDA network
     - `resultFee`: For result submission
     - `batchFee`: For batch processing

2. **Result Flow**
   - Results are submitted with Merkle proofs through `SedaCore.postResult()`
   - `Secp256k1Prover` validates the proof against the latest batch
   - Valid results trigger fee distribution from Core to the FeeManager
   - **Incentives**: Upon result validation:
     - Result submitters' fees are transferred to FeeManager
     - Batch maintainers' fees are transferred to FeeManager
     - Unused fees are returned to the original requestor

3. **Fee Management**
   - FeeManager accumulates fees for recipients as they're transferred from Core
   - Recipients must explicitly call `withdrawFees()` to claim their accumulated fees
   - Pull-based payment system ensures secure fee distribution
   - For timed-out requests, original requestors can reclaim their unspent fees

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (latest version)

### Dependencies

This project relies on the following dependencies:

- Development dependencies (listed in `package.json`)
- [@openzeppelin/contracts](https://github.com/OpenZeppelin/openzeppelin-contracts) for:
  - ECDSA signature verification
  - Merkle Tree verifications
  - Access control
  - Contract upgradeability (UUPS pattern)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/sedaprotocol/seda-evm-contracts.git
   ```

2. Navigate to the project directory:
   ```bash
   cd seda-evm-contracts
   ```

3. Install dependencies:
   ```bash
   bun install
   ```
   
### Development

Available commands:

1. Compile contracts:
   ```bash
   bun run compile
   ```

2. Run tests:
   ```bash
   bun run test
   ```

3. Run tests with coverage:
   ```bash
   bun run test:coverage
   ```

4. Run tests with gas reporting:
   ```bash
   bun run test:gas
   ```

5. Lint and format code:
   ```bash
   # Run all checks (lint + format)
   bun run check

   # Lint Solidity files
   bun run lint:sol
   bun run lint:sol:fix

   # Lint TypeScript files (using Biome)
   bun run lint:ts
   bun run lint:ts:fix

   # Format Solidity files
   bun run format:sol
   bun run format:sol:fix
   ```

6. Other utilities:
   ```bash
   # Generate test vectors
   bun run gen:testvectors

   # Clean build artifacts
   bun run clean
   ```

### Configuration

The project uses a network configuration file (`config/networks.ts`) to manage different EVM network connections. Here's how to set it up:

1. Create or modify `config/networks.ts`:
```typescript
import type { Networks } from './types';

export const networks: Networks = {
  baseSepolia: {
    accounts: 'EVM_PRIVATE_KEY', // Ensure this is set in your .env file
    chainId: 84532,
    url: 'https://sepolia.base.org',
    verify: {
      etherscan: {
        apiKey: process.env.BASE_SEPOLIA_ETHERSCAN_API_KEY, // Ensure this is set in your .env file
        apiUrl: 'https://api-sepolia.basescan.org/api',
        browserUrl: 'https://sepolia.basescan.org',
      }
    }
  }
};
```

2. Set up your environment variables in `.env`:
```bash
# Network Configuration
EVM_PRIVATE_KEY=your-private-key-here # Replace with your actual private key
BASE_SEPOLIA_ETHERSCAN_API_KEY=your-api-key-here # Replace with your actual API key

# Add other network-specific variables as needed
```

### Configuration Options

Each network configuration can include:

- **accounts**: Array of private keys or HD wallet configuration
- **chainId** (required): The network's chain ID
- **url** (required): RPC endpoint URL
- **verify**: Contract verification settings
  - **etherscan**: Block explorer API configuration
    - **apiKey**: Your block explorer API key
    - **apiUrl**: API endpoint for verification
    - **browserUrl**: Block explorer URL

### Deployment

These tasks are available via `bun run seda` or using Hardhat directly:
```bash
$ npx hardhat seda --help
Hardhat version 2.22.17

Usage: hardhat [GLOBAL OPTIONS] seda <TASK> [TASK OPTIONS]

AVAILABLE TASKS:

  deploy:all                    Deploys the Secp256k1ProverV1 and SedaCoreV1 contracts
  deploy:core                   Deploys the SedaCoreV1 contract
  deploy:fee-manager            Deploys the SedaFeeManager contract
  deploy:prover                 Deploys the Secp256k1ProverV1 contract
  dev:deploy:all                Deploys the Secp256k1ProverResettable and SedaCoreV1 contracts (only for testing)
  dev:deploy:permissioned       Deploys the Permissioned SEDA contract (only for testing)
  dev:deploy:prover             Deploys the Secp256k1ProverResettable contract (only for testing)
  dev:reset-prover              Resets a Secp256k1ProverResettable contract to a specified batch (only for testing)
  utils:post-request            Post a data request to a ISedaCore contract with attached funds
  utils:upgrade-proxy           Deploys and upgrades a proxy implementation contract
```

seda: Deploy and interact with SEDA contracts

For global options help run: hardhat help
```

> [!NOTE]
> - The `--reset` flag replaces existing deployment files
> - The `--verify` flag triggers contract verification on block explorers
> - The `--params` flag specifies a JSON file with deployment parameters

Example deployment with parameters:

```bash
bun run seda deploy:all --params deployments/parameters-example.json
```

See [parameters-example.json](deployments/parameters-example.json) for an example configuration file that specifies contract initialization parameters.

## Contributing

We welcome contributions from the community! Please feel free to submit issues, create pull requests, or join our [Discord](https://discord.com/invite/seda) for discussions.

## Security

If you discover a security vulnerability, please send an e-mail to security@seda.xyz. All security vulnerabilities will be promptly addressed.

## License

This project is open source and available under the [MIT License](LICENSE).
