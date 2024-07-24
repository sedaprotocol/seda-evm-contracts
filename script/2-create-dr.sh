#!/usr/bin/env bash

# Exit if any command returns an error
set -eo pipefail

parent_path=$(cd "$(dirname "${BASH_SOURCE[0]}")" ; pwd -P )
source "${parent_path}/../.env"
source "${parent_path}/common.sh"

# Check if forge is installed
check_commands forge

# Required variables
check_env_vars EVM_RPC EVM_PRIVATE_KEY EVM_ORACLE_CONTRACT

forge script script/SedaProver.s.sol:CreateDr --rpc-url $EVM_RPC --broadcast --verify -vvvv --ffi

