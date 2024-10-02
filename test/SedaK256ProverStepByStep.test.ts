import {
    loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";

import { expect } from "chai";
import { ethers } from "hardhat";
import { SimpleMerkleTree } from '@openzeppelin/merkle-tree';

describe("SedaK256Prover: test vectors", () => {

    it("should create same addresses", async () => {
        // Create wallets from the given private keys in decimal format
        const privateKeysDec = [
            "19364754072319078679550301671505040179035858431960811629105035944776133510182",
            "68619014097430004589532778183241588574857414830238493947312392711069044622953",
            "58435399889922176161880059996414222578881241975318132253376082907538942305313",
            "64770165991303981399885074754284222540880024302873026014683458694822777728452"
        ];

        const wallets = privateKeysDec.map(pkDec => {
            // Convert decimal to hexadecimal, ensure it's 32 bytes long, and create a wallet
            const pkHex = BigInt(pkDec).toString(16).padStart(64, '0');
            return new ethers.Wallet(`0x${pkHex}`);
        });

        // Assert that the private keys correspond to the expected addresses
        expect(wallets[0].address).to.equal("0xCc082f1F022BEA35aC8e1b24F854B36202a3028f");
        expect(wallets[1].address).to.equal("0x79492bD49B1F7B86B23C8c6405Bf1474BEd33CF9");
        expect(wallets[2].address).to.equal("0x1991F8B5b0cCc1B24B0C07884bEC90188f9FC07C");
        expect(wallets[3].address).to.equal("0xe0eD1759b6b7356474E310e02FD3dC8eF8c1878f");
    });

    it("should create same sorted Simple Merkle Tree", async () => {
        const validators = [
            "0xCc082f1F022BEA35aC8e1b24F854B36202a3028f",
            "0x79492bD49B1F7B86B23C8c6405Bf1474BEd33CF9",
            "0x1991F8B5b0cCc1B24B0C07884bEC90188f9FC07C",
            "0xe0eD1759b6b7356474E310e02FD3dC8eF8c1878f"
        ]

        const leaves = [];
        leaves.push(ethers.solidityPackedKeccak256(
            ["address", "uint32"],
            [validators[0], 70_000_000]
        ));
        leaves.push(ethers.solidityPackedKeccak256(
            ["address", "uint32"],
            [validators[1], 10_000_000]
        ));
        leaves.push(ethers.solidityPackedKeccak256(
            ["address", "uint32"],
            [validators[2], 10_000_000]
        ));
        leaves.push(ethers.solidityPackedKeccak256(
            ["address", "uint32"],
            [validators[3], 10_000_000]
        ));

        const tree = SimpleMerkleTree.of(leaves, { sortLeaves: true });

        // Assert the merkle root
        expect(tree.root).to.equal("0x7cfabf40bbb7751ee9b7cdc882a3ff7f640290777a7531311df18afca1060bca");

        const proofForLeaf0 = tree.getProof(0);
        expect(proofForLeaf0).to.deep.equal([
            "0xa7440814145cfa0232f2f808eee353cfddf8a89f4656aedb3ed0262ab9f9d819",
            "0xc940381413165a94c0f8bcec61dcd5e64527bf9c000d02ef65297e1d23d67f1e"
        ]);
    });

    it("should create same batch ID", async () => {
        const initialBatch = {
            batchHeight: 0,
            blockHeight: 0,
            validatorRoot: "0x7cfabf40bbb7751ee9b7cdc882a3ff7f640290777a7531311df18afca1060bca",
            resultsRoot: ethers.ZeroHash
        };

        // Compute batch ID
        const initialBatchId = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
                ['uint256', 'uint256', 'bytes32', 'bytes32'],
                [initialBatch.batchHeight, initialBatch.blockHeight, initialBatch.validatorRoot, initialBatch.resultsRoot]
            )
        );
        expect(initialBatchId).to.equal("0xcd949028b47d49aea6a35d29f7b344b178ee4cb5b4c6cd24ec1476ef33a40dcd");  // Replace with the actual expected value

        // Create a new batch
        const newBatch = {
            batchHeight: 1,
            blockHeight: 100,
            validatorRoot: ethers.keccak256(ethers.toUtf8Bytes("new validator root")),
            resultsRoot: ethers.keccak256(ethers.toUtf8Bytes("new results root"))
        };

        // Compute batch ID
        const newBatchId = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
                ['uint256', 'uint256', 'bytes32', 'bytes32'],
                [newBatch.batchHeight, newBatch.blockHeight, newBatch.validatorRoot, newBatch.resultsRoot]
            )
        );
        expect(newBatchId).to.equal("0x912bbbefae54a25cac5a2e15d707a40c7874341a412088f363e71c28f08a7ef6");  // Replace with the actual expected value
    });

    it("should create same signatures", async () => {
        // Create validator wallet from private key
        const pkHex = BigInt("19364754072319078679550301671505040179035858431960811629105035944776133510182").toString(16).padStart(64, '0');
        const validatorWallet = new ethers.Wallet(pkHex);

        expect(validatorWallet.address).to.equal("0xCc082f1F022BEA35aC8e1b24F854B36202a3028f");

        // Sign the new batch ID
        const newBatchIdToSign = "0x912bbbefae54a25cac5a2e15d707a40c7874341a412088f363e71c28f08a7ef6";

        // Sign the batch ID
        // Do not use the following because an additional hash is computed:
        // `const signature = await validatorWallet.signMessage(...);`
        const signature = await validatorWallet.signingKey.sign(newBatchIdToSign);

        // Verify the signature
        const recoveredAddress = ethers.recoverAddress(newBatchIdToSign, signature);
        expect(recoveredAddress).to.equal(validatorWallet.address);

        // signature.serialized
        const validSignature = "0xc222a45941b2f856038bc20cbb220cf469b50002b555186b1b00b5d4fff3ad634004c274cc1afdd2371cfc6a1849ad60279f82255a6038af7ac60624579620541c";
        const recoveredAddress2 = ethers.recoverAddress(newBatchIdToSign, validSignature);
        expect(recoveredAddress2).to.equal(validatorWallet.address);
    });

    it("should create same proofs", async () => {
        // Create initial batch
        const initialBatch = {
            batchHeight: 0,
            blockHeight: 0,
            validatorRoot: "0x7cfabf40bbb7751ee9b7cdc882a3ff7f640290777a7531311df18afca1060bca", // Placeholder, replace with actual validatorRoot
            resultsRoot: ethers.ZeroHash
        };

        // Deploy the SedaDataTypes library first
        const DataTypesFactory = await ethers.getContractFactory("SedaDataTypes");
        const dataTypes = await DataTypesFactory.deploy();

        // Deploy the contract
        const ProverFactory = await ethers.getContractFactory("SedaK256Prover", {
            libraries: {
                SedaDataTypes: await dataTypes.getAddress(),
            },
        });
        const prover = await ProverFactory.deploy(initialBatch);

        expect(prover).to.not.be.null;

        const currentBatch = await prover.currentBatch();
        expect(currentBatch.batchHeight).to.equal(0);

        // Update the batch
        const newBatch = {
            batchHeight: 1,
            blockHeight: 100,
            validatorRoot: ethers.keccak256(ethers.toUtf8Bytes("new validator root")),
            resultsRoot: ethers.keccak256(ethers.toUtf8Bytes("new results root"))
        };

        const signatures = [
            "0xc222a45941b2f856038bc20cbb220cf469b50002b555186b1b00b5d4fff3ad634004c274cc1afdd2371cfc6a1849ad60279f82255a6038af7ac60624579620541c"
        ];

        const proofs = [
            {
                publicKey: "0xCc082f1F022BEA35aC8e1b24F854B36202a3028f",
                votingPower: 70_000_000, // 70.000000%
                merkleProof: [
                    "0xa7440814145cfa0232f2f808eee353cfddf8a89f4656aedb3ed0262ab9f9d819",
                    "0xc940381413165a94c0f8bcec61dcd5e64527bf9c000d02ef65297e1d23d67f1e"
                ]
            }
        ];

        await prover.updateBatch(newBatch, signatures, proofs);

        const updatedBatch = await prover.currentBatch();
        expect(updatedBatch.batchHeight).to.equal(1);
    });
});