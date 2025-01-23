import { ethers } from 'hardhat';

export const SEDA_DATA_TYPES_VERSION = '0.0.1';
export const ONE_DAY_IN_SECONDS = 24 * 60 * 60;
export const RESULT_DOMAIN_SEPARATOR = '0x00';
export const SECP256K1_DOMAIN_SEPARATOR = '0x01';
export const NON_ZERO_HASH = ethers.keccak256(ethers.toUtf8Bytes('0x'));
