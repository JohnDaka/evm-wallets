# @dakaio/evm-wallets

Tells which browser wallet is **really** installed, then connects, switches networks, reads balances and sends transfers through it.

With several extensions installed, `window.ethereum` lies:

- **Coinbase Wallet** takes `window.ethereum` for itself, says `isMetaMask: true`, and hides MetaMask's real provider inside `window.ethereum.providerMap`.
- **MetaMask** alone sets `isMetaMask`, and so does almost every other wallet.

Checking `isMetaMask` therefore says "MetaMask" when only Coinbase Wallet is there, and talking to `window.ethereum` sends MetaMask's users to Coinbase. This package reads `providerMap` first and `isCoinbaseWallet` second, so each wallet gets its own provider and the "installed" answer is exact:

| Installed | `window.ethereum` | MetaMask | Coinbase Wallet |
|---|---|---|---|
| nothing | none | not installed | not installed |
| MetaMask | MetaMask | its provider | not installed |
| Coinbase Wallet | Coinbase (`isMetaMask` too) | not installed | its provider |
| both | Coinbase, with `providerMap` | `providerMap` → MetaMask | `providerMap` → Coinbase |

```sh
pnpm add @dakaio/evm-wallets
```

## Use

```ts
import { INSTALLED_WALLETS, WALLET_MAP, WALLET_TYPE, EthereumWallet } from '@dakaio/evm-wallets';

INSTALLED_WALLETS; // { MetaMask: true, CoinbaseWallet: false }

const wallet = WALLET_MAP.get(WALLET_TYPE.METAMASK)!;
if (wallet.isAvailable()) {
  const [address] = await wallet.connect();
  await wallet.switchNetwork(137); // MetaMask is asked to add Polygon if it does not know it
  const balance = await wallet.getBalance(address); // '1.2346'
}

wallet.getProvider().on('accountsChanged', (accounts: string[]) => { /* ... */ });
```

`window.ethereum` is read once, when the package loads, and `INSTALLED_WALLETS` is worked out then. Outside a browser (server rendering, tests) every wallet is "not installed".

### Sending a transfer

```ts
const result = await wallet.sendTransaction({
  fromAddress: address,
  toAddress: depositAddress,
  amount: '0.05',
  token: 'ETH',
  chainId: 1,
  metadata: { userId: 7, orderId: 'A-12' },
});
// { txHash: '0x...', success: true }  or  { txHash: '', success: false, error: '...' }
```

- The amount is sent in wei, assuming 18 decimals (native coins: ETH, BNB, POL, AVAX).
- `metadata` goes into the transaction's `data` as JSON, with `token` added, so the receiving side can tell what the transfer is for. Every byte costs gas.

### Networks and icons

Ethereum, BNB Smart Chain, Polygon and Avalanche C-Chain are built in: their names, explorers, and the `wallet_addEthereumChain` parameters MetaMask needs. Give them the app's own icons, or another list, once at start-up:

```ts
import { configureWallets, CHAIN_ID } from '@dakaio/evm-wallets';

configureWallets({
  networks: {
    [CHAIN_ID.ETHEREUM]: { name: 'Ethereum Mainnet', icon: '/networks/eth.png' },
    [CHAIN_ID.POLYGON]: { name: 'Polygon Mainnet', icon: '/networks/pol.png' },
  },
});

EthereumWallet.getSupportedNetworks();
EthereumWallet.getExplorerUrl('0xabc', '0x38'); // https://bscscan.com/address/0xabc
EthereumWallet.normalizeChainId('0x89');        // 137
```

### Another wallet

Extend `EthereumWallet` the way `MetaMaskWallet` and `CoinbaseWallet` do: answer `isAvailable()` and `getProvider()` from `providerMap` and the provider's own flags.

## API

| Export | What it is |
|---|---|
| `AbstractWallet` | The contract: `isAvailable`, `getProvider`, `getLibrary`, `isConnected`, `connect`, `disconnect`, `sendTransaction`, `getBalance`, `getSupportedNetworks`, `switchNetwork` |
| `EthereumWallet` | Any EIP-1193 `window.ethereum`; static `normalizeChainId`, `getExplorerUrl`, `getExplorerName`, `getSupportedNetworks` |
| `MetaMaskWallet`, `CoinbaseWallet` | The two wallets, told apart through `providerMap` and `isCoinbaseWallet` |
| `WALLET_MAP`, `WALLET_SET`, `INSTALLED_WALLETS` | The wallets by type, and which are installed |
| `WALLET_TYPE` | `METAMASK: 'MetaMask'`, `COINBASE: 'CoinbaseWallet'`: the `providerMap` keys |
| `CHAIN_ID`, `CHAIN_MAP`, `ADD_NETWORK_PARAMS` | The built-in networks |
| `configureWallets({ networks?, chains? })` | The app's networks and explorers |
| `WalletAddress`, `ConnectedWallet`, `InstalledWalletList`, `Web3Listeners`, `NetworkConfig`, `SendTransactionParams`, `TransactionResult`, `ChainConfig`, `WalletSettings` | Types |

## Releasing

Raise `version` in `package.json` in a pull request. After it is merged, run `pnpm release` on a clean checkout: it tags `main` with `v<version>` and pushes the tag, and the `publish` workflow tests, builds and publishes to npm.

## License

MIT
