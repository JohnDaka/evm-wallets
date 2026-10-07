import { NATIVE_DECIMALS } from './ethereum.ts';

/**
 * The chains the package knows, by name: their EIP-155 chain ids, the number a wallet and a
 * transaction identify a chain by.
 *
 * @example
 * await wallet.switchNetwork(CHAIN_ID.POLYGON);
 * EthereumWallet.getExplorerName(CHAIN_ID.BSC); // 'BSCScan'
 */
export const CHAIN_ID = {
  /** Ethereum Mainnet, 1: ether (ETH). */
  ETHEREUM: 1,
  /** BNB Smart Chain, 56: BNB. */
  BSC: 56,
  /** Polygon PoS, 137: POL, formerly MATIC. */
  POLYGON: 137,
  /** Avalanche C-Chain, 43114: AVAX. */
  AVALANCHE: 43114,
} as const;
/** One of the {@link CHAIN_ID} values. */
export type CHAIN_ID = (typeof CHAIN_ID)[keyof typeof CHAIN_ID];

/** How the package names a chain and links to its block explorer: a `CHAIN_MAP` entry. */
export type ChainConfig = {
  /** The chain's name. */
  name: string;
  /** The explorer's address, without a trailing slash: its pages are joined on with `/`. */
  explorerUrl: string;
  /** The explorer's name, for a link's text ("View on Etherscan"). */
  explorerName: string;
  /**
   * The label exchanges give the network when a user picks how to withdraw: `ERC20` on Ethereum,
   * `BEP20` on BSC. Shown next to a deposit address, so the user sends over the right network.
   */
  protocol: string;
};

/**
 * The chains the package knows, by chain id: their names, explorers and exchange labels. What
 * `getExplorerUrl` and `getExplorerName` read unless the app configures its own (`chains`), and
 * where the default networks take their names from.
 *
 * @example
 * CHAIN_MAP.get(CHAIN_ID.POLYGON)?.explorerName; // 'PolygonScan'
 */
export const CHAIN_MAP: Map<number, ChainConfig> = new Map([
  [
    CHAIN_ID.ETHEREUM,
    {
      name: 'Ethereum Mainnet',
      explorerUrl: 'https://etherscan.io',
      explorerName: 'Etherscan',
      protocol: 'ERC20',
    },
  ],
  [
    CHAIN_ID.BSC,
    {
      name: 'BSC Mainnet',
      explorerUrl: 'https://bscscan.com',
      explorerName: 'BSCScan',
      protocol: 'BEP20',
    },
  ],
  [
    CHAIN_ID.POLYGON,
    {
      name: 'Polygon Mainnet',
      explorerUrl: 'https://polygonscan.com',
      explorerName: 'PolygonScan',
      protocol: 'MATIC',
    },
  ],
  [
    CHAIN_ID.AVALANCHE,
    {
      name: 'Avalanche C-Chain',
      explorerUrl: 'https://snowtrace.io',
      explorerName: 'Snowtrace',
      protocol: 'C-Chain',
    },
  ],
]);

/** Pages of a block explorer, under its URL. */
export const EXPLORER_PATH = {
  /** An address, `address`: its balance and transactions. */
  ADDRESS: 'address',
} as const;
/** One of the {@link EXPLORER_PATH} values. */
export type EXPLORER_PATH = (typeof EXPLORER_PATH)[keyof typeof EXPLORER_PATH];

/**
 * EIP-3085: what a wallet needs to add a chain, besides its id. `wallet_addEthereumChain` gets
 * these together with `chainId` as hex.
 */
export type AddNetworkParams = {
  /** The chain's name, as the wallet will show it. */
  chainName: string;
  /** The chain's native coin: the one gas is paid in. */
  nativeCurrency: {
    /** The coin's name. */
    name: string;
    /** Its ticker: 2 to 6 characters, by EIP-3085. */
    symbol: string;
    /** Its decimals: `NATIVE_DECIMALS` for every chain here. */
    decimals: number;
  };
  /** JSON-RPC endpoints the wallet will read and send through. */
  rpcUrls: string[];
  /** Block explorers the wallet will link its transactions to. */
  blockExplorerUrls: string[];
};

/**
 * `wallet_addEthereumChain` parameters MetaMask is asked to add a network with when it does not
 * know it yet (error 4902 on switching). Ethereum is not here: every wallet has it.
 *
 * @example
 * await provider.request({
 *   method: RPC_METHOD.ADD_CHAIN,
 *   params: [{ chainId: toHex(CHAIN_ID.POLYGON), ...ADD_NETWORK_PARAMS[CHAIN_ID.POLYGON] }],
 * });
 */
export const ADD_NETWORK_PARAMS: Record<number, AddNetworkParams> = {
  [CHAIN_ID.BSC]: {
    chainName: 'BNB Smart Chain',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: NATIVE_DECIMALS },
    rpcUrls: ['https://bsc-dataseed.binance.org/'],
    blockExplorerUrls: ['https://bscscan.com/'],
  },
  [CHAIN_ID.POLYGON]: {
    chainName: 'Polygon Mainnet',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: NATIVE_DECIMALS },
    rpcUrls: ['https://polygon-rpc.com/'],
    blockExplorerUrls: ['https://polygonscan.com/'],
  },
  [CHAIN_ID.AVALANCHE]: {
    chainName: 'Avalanche C-Chain',
    nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: NATIVE_DECIMALS },
    rpcUrls: ['https://api.avax.network/ext/bc/C/rpc'],
    blockExplorerUrls: ['https://snowtrace.io/'],
  },
};
