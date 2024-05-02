#!/usr/bin/env bash

# If not defined, set to default values
SLEEP_TIME=${SLEEP_TIME:-10}

# function: check if command exists
# Usage: check_commands <command_names...>
# Checks if the given commands are available in the system
check_commands(){
    local command_names=("$@")
    for command_name in "${command_names[@]}"; do
        if ! command -v ${command_name} > /dev/null 2>&1; then
            echo "Command \`${command_name}\` not found." >&2
            command_unset=true
        fi
    done
    [ -n "$command_unset" ] && exit 1

    return 0
}

# function: check if env vars are set
# Usage: check_env_vars <var_names...>
# Checks if the given environment variables are set
check_env_vars(){
    local var_names=("$@")
    for var_name in "${var_names[@]}"; do
        [ -z "${!var_name}" ] && echo "$var_name must be defined" >&2 && var_unset=true
    done
    [ -n "$var_unset" ] && exit 1

    return 0
}

# function: update .env file <NAME> <VALUE>
# Usage: update_env_file <NAME> <VALUE>
# Updates the .env file with the provided name and value
update_env_file() {
    parent_path=$(cd "$(dirname "${BASH_SOURCE[0]}")" ; pwd -P )
    echo "# $(date)" >> "${parent_path}/../.env"
    echo "$1=$2" >> "${parent_path}/../.env"
}
