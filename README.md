# hanzenet-smart-contracts
*A set of smart contracts for the HanzeNet blockchain platform*

[![license](https://img.shields.io/github/license/dvdgiessen/hanzenet-smart-contracts.svg)](https://github.com/DvdGiessen/hanzenet-smart-contracts/blob/master/LICENSE)

## Overview
This repository contains a set of smart contracts for the HanzeNet platform
developed as part of my masters' thesis at the University of Twente.

The `src` directory contains the TypeScript source code of all the smart
contracts. The `dist` folder contains the compiled contracts in JSON format,
ready to be used with [`validana-cli`](https://www.npmjs.com/package/validana-cli).

## Usage example
First, see [the `validana-cli` documentation](https://github.com/DvdGiessen/validana-cli#readme)
for details on how to set up Validana and the CLI.

```sh
# Install the JSON command line tool
sudo npm -g i json

# Clone the repository to the current directory
git clone https://github.com/DvdGiessen/hanzenet-smart-contracts.git .

# Set environment variables so we don't have to type them as parameters every time
export VALIDANA_PREFIX=hanzenet
export VALIDANA_URL=ws://localhost:8080/api/v1/

# Submit every contract for creation on the blockchain and shows whether that was successful
# Assumes there is a file `processorkey.json` which contains the private key of the processor
find dist -type f -exec validana-cli contract create --contract-file {} --signing-keyfile processorkey.json \; | json -ga transactionId | xargs -n1 validana-cli transaction await --id | json -ga payload.type message

# Generate two new keys: One for the context owner and one for a user
validana-cli key generate > contextkey.json
validana-cli key generate > userkey.json

# Add user as a trader in the context
validana-cli contract execute --contract-type Trader --payload "{\"context\": \"$(json -f contextkey.json address)\", \"address\": \"$(json -f userkey.json address)\", \"allowed\": true}" --signing-keyfile contextkey.json
```

## License
These smart contracts are freely distributable under the terms of the
[AGPLv3 license](https://github.com/DvdGiessen/hanzenet-smart-contracts/blob/master/LICENSE).
