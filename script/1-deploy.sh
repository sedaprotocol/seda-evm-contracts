#!/usr/bin/env bash

# Exit if any command returns an error
set -eo pipefail

parent_path=$(cd "$(dirname "${BASH_SOURCE[0]}")" ; pwd -P )
source "${parent_path}/../.env"
source "${parent_path}/common.sh"

# Check if forge is installed
check_commands forge

# Required variables
check_env_vars EVM_RPC EVM_PRIVATE_KEY

# Set verify flag
if [ -z "$ETHERSCAN_API_KEY" ]; then
    VERIFY_FLAGS=""
else
    VERIFY_FLAGS="--verify --verifier-url $EVM_VERIFIER_URL --etherscan-api-key $ETHERSCAN_API_KEY"
fi;

command="forge create $VERIFY_FLAGS --rpc-url $EVM_RPC --private-key $EVM_PRIVATE_KEY src/SedaOracle.sol:SedaOracle --constructor-args $EVM_ADMIN_ADDRESS \[$EVM_ADMIN_ADDRESS\]"
echo $command
output=$($command)

# Extract the deployed address
EVM_ORACLE_CONTRACT=$(echo "$output" | sed -n 's/Deployed to: \(.*\)/\1/p')

echo "Deployed to $EVM_ORACLE_CONTRACT (EVM_ORACLE_CONTRACT)"

# Update .env file with the deployed address
update_env_file "EVM_ORACLE_CONTRACT" "$EVM_ORACLE_CONTRACT"

exit 0
