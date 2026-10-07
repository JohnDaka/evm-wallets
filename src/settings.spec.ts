import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { CHAIN_ID, CHAIN_MAP, type ChainConfig } from './blockchain-networks.ts';
import { RPC_METHOD } from './ethereum.ts';
import { EthereumWallet } from './ethereum-wallet.ts';
import { MetaMaskWallet } from './metamask-wallet.ts';
import { configureWallets, settings, WALLET_LOG } from './settings.ts';
import {
  ADDRESS,
  INTERNAL_ERROR,
  metaMaskProvider,
  RecordingLogger,
  rpcError,
} from './testing/fakes.ts';
import { leavePage, putOnPage } from './testing/on-page.ts';

/** The settings as the package starts with them, to put back after each spec. */
const DEFAULTS = { ...settings };

/** Sepolia, Ethereum's test network: a chain the package does not know. */
const SEPOLIA_ID = 11_155_111;
const SEPOLIA: ChainConfig = {
  name: 'Sepolia',
  explorerUrl: 'https://sepolia.etherscan.io',
  explorerName: 'Sepolia Etherscan',
  protocol: 'ERC20',
};

afterEach(() => {
  configureWallets(DEFAULTS);
  leavePage();
});

describe('the default settings', () => {
  it('offer every chain the package knows, named as in CHAIN_MAP, with no icon', () => {
    assert.deepEqual(settings.networks, {
      [CHAIN_ID.ETHEREUM]: { name: 'Ethereum Mainnet', icon: '' },
      [CHAIN_ID.BSC]: { name: 'BSC Mainnet', icon: '' },
      [CHAIN_ID.POLYGON]: { name: 'Polygon Mainnet', icon: '' },
      [CHAIN_ID.AVALANCHE]: { name: 'Avalanche C-Chain', icon: '' },
    });
  });

  it("link to CHAIN_MAP's explorers and log to the console", () => {
    assert.equal(settings.chains, CHAIN_MAP);
    assert.equal(settings.logger, console);
  });
});

describe('configureWallets', () => {
  it('replaces the networks as a whole, and keeps the settings not given', () => {
    const networks = { [CHAIN_ID.POLYGON]: { name: 'Polygon', icon: '/networks/pol.svg' } };
    configureWallets({ networks });
    assert.equal(EthereumWallet.getSupportedNetworks(), networks);
    assert.equal(settings.chains, CHAIN_MAP);
    assert.equal(settings.logger, console);
  });

  it('replaces the explorers the links point to, Ethereum staying the fallback', () => {
    configureWallets({
      chains: new Map([
        [CHAIN_ID.ETHEREUM, CHAIN_MAP.get(CHAIN_ID.ETHEREUM)!],
        [SEPOLIA_ID, SEPOLIA],
      ]),
    });
    assert.equal(
      EthereumWallet.getExplorerUrl(ADDRESS.USER, SEPOLIA_ID),
      `https://sepolia.etherscan.io/address/${ADDRESS.USER}`,
    );
    assert.equal(EthereumWallet.getExplorerName('0xaa36a7'), 'Sepolia Etherscan');
    assert.equal(EthereumWallet.getExplorerName(CHAIN_ID.POLYGON), 'Etherscan');
  });

  it('replaces the logger the wallets write to', async () => {
    const logger = new RecordingLogger();
    configureWallets({ logger });
    const failure = rpcError(INTERNAL_ERROR, 'Internal JSON-RPC error.');
    putOnPage(metaMaskProvider({ [RPC_METHOD.GET_BALANCE]: failure }));
    await new MetaMaskWallet().getBalance(ADDRESS.USER);
    assert.deepEqual(logger.errors, [[WALLET_LOG.BALANCE_FAILED, failure]]);
  });
});

describe('WALLET_LOG', () => {
  it('ends every text with a colon: the error or the details follow it', () => {
    for (const text of Object.values(WALLET_LOG)) {
      assert.ok(text.endsWith(':'), text);
    }
  });
});
