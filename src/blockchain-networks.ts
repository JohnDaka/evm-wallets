export const CHAIN_ID = {
  ETHEREUM: 1,
  BSC: 56,
  POLYGON: 137,
  AVALANCHE: 43114,
} as const;
export type CHAIN_ID = (typeof CHAIN_ID)[keyof typeof CHAIN_ID];

export type ChainConfig = {
  name: string;
  explorerUrl: string;
  explorerName: string;
  protocol: string;
};

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

/**
 * `wallet_addEthereumChain` parameters MetaMask is asked to add a network with when it does not
 * know it yet (error 4902 on switching).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ADD_NETWORK_PARAMS: Record<number, any> = {
  [CHAIN_ID.BSC]: {
    chainName: 'BNB Smart Chain',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: ['https://bsc-dataseed.binance.org/'],
    blockExplorerUrls: ['https://bscscan.com/'],
  },
  [CHAIN_ID.POLYGON]: {
    chainName: 'Polygon Mainnet',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    rpcUrls: ['https://polygon-rpc.com/'],
    blockExplorerUrls: ['https://polygonscan.com/'],
  },
  [CHAIN_ID.AVALANCHE]: {
    chainName: 'Avalanche C-Chain',
    nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
    rpcUrls: ['https://api.avax.network/ext/bc/C/rpc'],
    blockExplorerUrls: ['https://snowtrace.io/'],
  },
};
