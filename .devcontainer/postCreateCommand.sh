#!/usr/bin/env bash

set -ex

sudo chown vscode target

# Foundry Install
curl -L https://foundry.paradigm.xyz/ | bash
/home/vscode/.foundry/bin/foundryup

# Update path
echo export PATH=\"$PATH:/home/vscode/.foundry/bin >> ~/.bashrc
echo export PATH=$PATH:/home/vscode/.foundry/bin >> ~/.zshrc
