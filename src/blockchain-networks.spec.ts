import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ADD_NETWORK_PARAMS, CHAIN_ID, CHAIN_MAP, EXPLORER_PATH } from './blockchain-networks.ts';
import { NATIVE_DECIMALS } from './ethereum.ts';

describe('CHAIN_ID', () => {
  it('holds the EIP-155 chain ids', () => {
    assert.deepEqual(CHAIN_ID, { ETHEREUM: 1, BSC: 56, POLYGON: 137, AVALANCHE: 43114 });
  });
});

describe('CHAIN_MAP', () => {
  it('has every chain the package knows', () => {
    assert.deepEqual([...CHAIN_MAP.keys()], Object.values(CHAIN_ID));
  });

  it('names each chain and its explorer, and labels it the way exchanges do', () => {
    assert.deepEqual(Object.fromEntries(CHAIN_MAP), {
      [CHAIN_ID.ETHEREUM]: {
        name: 'Ethereum Mainnet',
        explorerUrl: 'https://etherscan.io',
        explorerName: 'Etherscan',
        protocol: 'ERC20',
      },
      [CHAIN_ID.BSC]: {
        name: 'BSC Mainnet',
        explorerUrl: 'https://bscscan.com',
        explorerName: 'BSCScan',
        protocol: 'BEP20',
      },
      [CHAIN_ID.POLYGON]: {
        name: 'Polygon Mainnet',
        explorerUrl: 'https://polygonscan.com',
        explorerName: 'PolygonScan',
        protocol: 'MATIC',
      },
      [CHAIN_ID.AVALANCHE]: {
        name: 'Avalanche C-Chain',
        explorerUrl: 'https://snowtrace.io',
        explorerName: 'Snowtrace',
        protocol: 'C-Chain',
      },
    });
  });

  it('gives each explorer as https, without a trailing slash to double', () => {
    for (const { explorerUrl } of CHAIN_MAP.values()) {
      assert.equal(new URL(explorerUrl).protocol, 'https:');
      assert.ok(!explorerUrl.endsWith('/'), explorerUrl);
    }
  });
});

describe('EXPLORER_PATH', () => {
  it('names the address page', () => {
    assert.deepEqual(EXPLORER_PATH, { ADDRESS: 'address' });
  });
});

describe('ADD_NETWORK_PARAMS', () => {
  it('has every chain but Ethereum, which every wallet has', () => {
    assert.deepEqual(Object.keys(ADD_NETWORK_PARAMS).map(Number), [
      CHAIN_ID.BSC,
      CHAIN_ID.POLYGON,
      CHAIN_ID.AVALANCHE,
    ]);
  });

  it('gives MetaMask what EIP-3085 asks for, Polygon for one', () => {
    assert.deepEqual(ADD_NETWORK_PARAMS[CHAIN_ID.POLYGON], {
      chainName: 'Polygon Mainnet',
      nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
      rpcUrls: ['https://polygon-rpc.com/'],
      blockExplorerUrls: ['https://polygonscan.com/'],
    });
  });

  it('counts every native coin in NATIVE_DECIMALS and reaches every endpoint over https', () => {
    for (const params of Object.values(ADD_NETWORK_PARAMS)) {
      assert.equal(params.nativeCurrency.decimals, NATIVE_DECIMALS);
      for (const url of [...params.rpcUrls, ...params.blockExplorerUrls]) {
        assert.equal(new URL(url).protocol, 'https:', url);
      }
    }
  });

  it('points the wallet at the same explorer the package links to', () => {
    for (const [chainId, params] of Object.entries(ADD_NETWORK_PARAMS)) {
      const chain = CHAIN_MAP.get(Number(chainId))!;
      assert.deepEqual(params.blockExplorerUrls, [`${chain.explorerUrl}/`]);
    }
  });
});
