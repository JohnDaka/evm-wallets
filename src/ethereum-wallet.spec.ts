import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { CHAIN_ID } from './blockchain-networks.ts';
import { WALLET_ERROR, WALLET_ERROR_MESSAGE } from './errors.ts';
import { fromHex, RPC_METHOD, textToHex, toHex, TRANSFER_GAS_LIMIT } from './ethereum.ts';
import { EthereumWallet } from './ethereum-wallet.ts';
import { MetaMaskWallet } from './metamask-wallet.ts';
import { configureWallets, WALLET_LOG } from './settings.ts';
import {
  ADDRESS,
  type Answers,
  DEPOSIT,
  type FakeProvider,
  INTERNAL_ERROR,
  metaMaskProvider,
  type RecordingLogger,
  resetSettings,
  rpcError,
  TX_HASH,
  USER_REJECTED,
  walletErrorWith,
} from './testing/fakes.ts';
import { leavePage, putOnPage } from './testing/on-page.ts';

/** One ether in wei. */
const ETHER = 10n ** 18n;

/** A chain the package knows nothing about. */
const UNKNOWN_CHAIN_ID = 999;

/** MetaMask alone on the page, answering each method as given: the wallet and its provider. */
const metaMaskWith = (answers: Answers = {}) => {
  const provider = putOnPage(metaMaskProvider(answers));
  return { provider, wallet: new MetaMaskWallet() };
};

/** A wallet on Ethereum that sends what it is asked: the answers a plain transfer needs. */
const SENDS_ON_ETHEREUM: Answers = {
  [RPC_METHOD.CHAIN_ID]: toHex(CHAIN_ID.ETHEREUM),
  [RPC_METHOD.SEND_TRANSACTION]: TX_HASH,
};

/** The transaction a provider was asked to send. */
const sentTransaction = (provider: FakeProvider) =>
  provider.requests.find(({ method }) => method === RPC_METHOD.SEND_TRANSACTION)!.params![0] as {
    value: string;
    data: string;
  };

/** Decodes a transaction's data the way the receiving side reads it. */
const readData = (data: string): unknown =>
  JSON.parse(Buffer.from(data.slice(2), 'hex').toString('utf8'));

describe('EthereumWallet', () => {
  let logger: RecordingLogger;
  beforeEach(() => {
    logger = resetSettings();
  });
  afterEach(leavePage);

  describe('normalizeChainId', () => {
    it('keeps a number as it is', () => {
      assert.equal(EthereumWallet.normalizeChainId(CHAIN_ID.POLYGON), CHAIN_ID.POLYGON);
    });

    it('reads 0x text as hex, the way wallets report chain ids (EIP-695)', () => {
      assert.equal(EthereumWallet.normalizeChainId('0x1'), CHAIN_ID.ETHEREUM);
      assert.equal(EthereumWallet.normalizeChainId('0x89'), CHAIN_ID.POLYGON);
      assert.equal(EthereumWallet.normalizeChainId('0xa86a'), CHAIN_ID.AVALANCHE);
      assert.equal(EthereumWallet.normalizeChainId('0xA86A'), CHAIN_ID.AVALANCHE);
    });

    it('reads text of decimal digits alone as decimal', () => {
      assert.equal(EthereumWallet.normalizeChainId('1'), CHAIN_ID.ETHEREUM);
      assert.equal(EthereumWallet.normalizeChainId('56'), CHAIN_ID.BSC);
      assert.equal(EthereumWallet.normalizeChainId('137'), CHAIN_ID.POLYGON);
      assert.equal(EthereumWallet.normalizeChainId('43114'), CHAIN_ID.AVALANCHE);
    });

    it('throws INVALID_CHAIN_ID for any other text', () => {
      for (const text of ['', '0x', '0xzz', '0X89', 'a86a', '89a', ' 137', '0x89 ', '-1', '1.5']) {
        assert.throws(
          () => EthereumWallet.normalizeChainId(text),
          walletErrorWith(WALLET_ERROR.INVALID_CHAIN_ID),
          `'${text}'`,
        );
      }
    });
  });

  describe('getExplorerUrl', () => {
    it("links to the address's page on the chain's explorer", () => {
      assert.equal(
        EthereumWallet.getExplorerUrl(ADDRESS.USER, CHAIN_ID.BSC),
        `https://bscscan.com/address/${ADDRESS.USER}`,
      );
    });

    it('takes the chain id as 0x hex or as decimal digits too', () => {
      assert.equal(
        EthereumWallet.getExplorerUrl(ADDRESS.USER, '0x89'),
        `https://polygonscan.com/address/${ADDRESS.USER}`,
      );
      assert.equal(
        EthereumWallet.getExplorerUrl(ADDRESS.USER, '137'),
        `https://polygonscan.com/address/${ADDRESS.USER}`,
      );
    });

    it('links to Etherscan for a chain it does not know', () => {
      assert.equal(
        EthereumWallet.getExplorerUrl(ADDRESS.USER, UNKNOWN_CHAIN_ID),
        `https://etherscan.io/address/${ADDRESS.USER}`,
      );
    });

    it('links to Etherscan, without throwing, for a chain id that is not one', () => {
      assert.equal(
        EthereumWallet.getExplorerUrl(ADDRESS.USER, 'polygon'),
        `https://etherscan.io/address/${ADDRESS.USER}`,
      );
    });
  });

  describe('getExplorerName', () => {
    it("names the chain's explorer, by number, by hex or by decimal digits", () => {
      assert.equal(EthereumWallet.getExplorerName(CHAIN_ID.AVALANCHE), 'Snowtrace');
      assert.equal(EthereumWallet.getExplorerName('0x38'), 'BSCScan');
      assert.equal(EthereumWallet.getExplorerName('56'), 'BSCScan');
    });

    it('names Etherscan for a chain it does not know', () => {
      assert.equal(EthereumWallet.getExplorerName(UNKNOWN_CHAIN_ID), 'Etherscan');
    });

    it('names Etherscan, without throwing, for a chain id that is not one', () => {
      assert.equal(EthereumWallet.getExplorerName('0x'), 'Etherscan');
    });
  });

  describe('getSupportedNetworks', () => {
    it('answers the networks the app offers, with or without a wallet', () => {
      const networks = { [CHAIN_ID.BSC]: { name: 'BNB Chain', icon: '/networks/bnb.svg' } };
      configureWallets({ networks });
      assert.equal(EthereumWallet.getSupportedNetworks(), networks);
      assert.equal(new EthereumWallet().getSupportedNetworks(), networks);
      assert.equal(metaMaskWith().wallet.getSupportedNetworks(), networks);
    });
  });

  describe('without a wallet on the page', () => {
    const wallet = new EthereumWallet();

    it('is not available, and has no provider', () => {
      assert.equal(wallet.isAvailable(), false);
      assert.equal(wallet.getProvider(), undefined);
      assert.equal(wallet.getLibrary(), undefined);
    });

    it('throws NO_PROVIDER from connect, and logs it', async () => {
      await assert.rejects(wallet.connect(), walletErrorWith(WALLET_ERROR.NO_PROVIDER));
      assert.equal(logger.errors[0][0], WALLET_LOG.CONNECT_FAILED);
    });

    it('throws NO_PROVIDER from switchNetwork', async () => {
      await assert.rejects(
        wallet.switchNetwork(CHAIN_ID.POLYGON),
        walletErrorWith(WALLET_ERROR.NO_PROVIDER),
      );
    });

    it('is not connected, and logs why', async () => {
      assert.equal(await wallet.isConnected(), false);
      assert.equal(logger.errors[0][0], WALLET_LOG.CONNECTION_CHECK_FAILED);
    });

    it("answers a transfer as failed, with NO_PROVIDER's code and message", async () => {
      assert.deepEqual(await wallet.sendTransaction(DEPOSIT), {
        txHash: '',
        success: false,
        error: WALLET_ERROR_MESSAGE[WALLET_ERROR.NO_PROVIDER],
        code: WALLET_ERROR.NO_PROVIDER,
      });
    });
  });

  describe('connect', () => {
    it('asks the user to connect, and answers the accounts they allowed', async () => {
      const accounts = [ADDRESS.USER, ADDRESS.OTHER];
      const { provider, wallet } = metaMaskWith({ [RPC_METHOD.REQUEST_ACCOUNTS]: accounts });
      assert.deepEqual(await wallet.connect(), accounts);
      assert.deepEqual(provider.requests, [{ method: RPC_METHOD.REQUEST_ACCOUNTS }]);
    });

    it("throws the wallet's own error when the user refuses, and logs it", async () => {
      const refusal = rpcError(USER_REJECTED, 'User rejected the request.');
      const { wallet } = metaMaskWith({ [RPC_METHOD.REQUEST_ACCOUNTS]: refusal });
      await assert.rejects(wallet.connect(), (error) => error === refusal);
      assert.deepEqual(logger.errors, [[WALLET_LOG.CONNECT_FAILED, refusal]]);
    });
  });

  describe('isConnected', () => {
    it('is true when the page is connected to an account, asked without a prompt', async () => {
      const { provider, wallet } = metaMaskWith({ [RPC_METHOD.ACCOUNTS]: [ADDRESS.USER] });
      assert.equal(await wallet.isConnected(), true);
      assert.deepEqual(provider.methods, [RPC_METHOD.ACCOUNTS]);
    });

    it('is false when the page is connected to no account', async () => {
      assert.equal(await metaMaskWith({ [RPC_METHOD.ACCOUNTS]: [] }).wallet.isConnected(), false);
    });

    it('is false when the wallet fails, and logs why', async () => {
      const failure = rpcError(INTERNAL_ERROR, 'Internal JSON-RPC error.');
      const { wallet } = metaMaskWith({ [RPC_METHOD.ACCOUNTS]: failure });
      assert.equal(await wallet.isConnected(), false);
      assert.deepEqual(logger.errors, [[WALLET_LOG.CONNECTION_CHECK_FAILED, failure]]);
    });
  });

  describe('disconnect', () => {
    it('resolves without asking the wallet anything', async () => {
      const { provider, wallet } = metaMaskWith();
      assert.equal(await wallet.disconnect(), undefined);
      assert.deepEqual(provider.requests, []);
    });
  });

  describe('switchNetwork', () => {
    it('asks the wallet to switch, with the chain id as hex', async () => {
      const { provider, wallet } = metaMaskWith();
      await wallet.switchNetwork(CHAIN_ID.POLYGON);
      assert.deepEqual(provider.requests, [
        { method: RPC_METHOD.SWITCH_CHAIN, params: [{ chainId: '0x89' }] },
      ]);
    });

    it("throws the wallet's own error when the user refuses to switch", async () => {
      const refusal = rpcError(USER_REJECTED, 'User rejected the request.');
      const { provider, wallet } = metaMaskWith({ [RPC_METHOD.SWITCH_CHAIN]: refusal });
      await assert.rejects(wallet.switchNetwork(CHAIN_ID.POLYGON), (error) => error === refusal);
      assert.deepEqual(provider.methods, [RPC_METHOD.SWITCH_CHAIN]);
    });
  });

  describe('sendTransaction', () => {
    it('asks the wallet its chain, then sends the amount in wei, the metadata in data, a gas limit and the chain id as hex', async () => {
      const { provider, wallet } = metaMaskWith(SENDS_ON_ETHEREUM);
      assert.deepEqual(await wallet.sendTransaction(DEPOSIT), { txHash: TX_HASH, success: true });
      assert.deepEqual(provider.requests, [
        { method: RPC_METHOD.CHAIN_ID },
        {
          method: RPC_METHOD.SEND_TRANSACTION,
          params: [
            {
              from: ADDRESS.USER,
              to: ADDRESS.DEPOSIT,
              value: toHex(ETHER / 2n),
              data: textToHex('{"depositId":"A-12","token":"ETH"}'),
              gas: toHex(TRANSFER_GAS_LIMIT),
              chainId: '0x1',
            },
          ],
        },
      ]);
    });

    it('sends nothing when the wallet is on another chain, and answers WRONG_NETWORK', async () => {
      const { provider, wallet } = metaMaskWith({
        ...SENDS_ON_ETHEREUM,
        [RPC_METHOD.CHAIN_ID]: toHex(CHAIN_ID.BSC),
      });
      assert.deepEqual(await wallet.sendTransaction(DEPOSIT), {
        txHash: '',
        success: false,
        error: WALLET_ERROR_MESSAGE[WALLET_ERROR.WRONG_NETWORK],
        code: WALLET_ERROR.WRONG_NETWORK,
      });
      assert.deepEqual(provider.methods, [RPC_METHOD.CHAIN_ID]);
      const [[text, error]] = logger.errors;
      assert.equal(text, WALLET_LOG.TRANSACTION_FAILED);
      walletErrorWith(WALLET_ERROR.WRONG_NETWORK)(error);
    });

    it("reads the wallet's chain id the way normalizeChainId does", async () => {
      const { wallet } = metaMaskWith({ ...SENDS_ON_ETHEREUM, [RPC_METHOD.CHAIN_ID]: '1' });
      assert.deepEqual(await wallet.sendTransaction(DEPOSIT), { txHash: TX_HASH, success: true });
    });

    it('sends nothing when the wallet answers a chain id that is not one: INVALID_CHAIN_ID', async () => {
      const { provider, wallet } = metaMaskWith({
        ...SENDS_ON_ETHEREUM,
        [RPC_METHOD.CHAIN_ID]: 'mainnet',
      });
      assert.deepEqual(await wallet.sendTransaction(DEPOSIT), {
        txHash: '',
        success: false,
        error: WALLET_ERROR_MESSAGE[WALLET_ERROR.INVALID_CHAIN_ID],
        code: WALLET_ERROR.INVALID_CHAIN_ID,
      });
      assert.deepEqual(provider.methods, [RPC_METHOD.CHAIN_ID]);
    });

    it('goes through on WRONG_NETWORK once the app switches the wallet and sends again', async () => {
      let walletChainId: number = CHAIN_ID.BSC;
      const { provider, wallet } = metaMaskWith({
        [RPC_METHOD.CHAIN_ID]: () => toHex(walletChainId),
        [RPC_METHOD.SWITCH_CHAIN]: (params: unknown[] | undefined) => {
          const [{ chainId }] = params as [{ chainId: string }];
          walletChainId = fromHex(chainId);
          return null;
        },
        [RPC_METHOD.SEND_TRANSACTION]: TX_HASH,
      });

      let result = await wallet.sendTransaction(DEPOSIT);
      if (result.code === WALLET_ERROR.WRONG_NETWORK) {
        await wallet.switchNetwork(DEPOSIT.chainId);
        result = await wallet.sendTransaction(DEPOSIT);
      }

      assert.deepEqual(result, { txHash: TX_HASH, success: true });
      assert.deepEqual(provider.methods, [
        RPC_METHOD.CHAIN_ID,
        RPC_METHOD.SWITCH_CHAIN,
        RPC_METHOD.CHAIN_ID,
        RPC_METHOD.SEND_TRANSACTION,
      ]);
    });

    it('logs a sent transfer with its hash and its metadata', async () => {
      const { wallet } = metaMaskWith(SENDS_ON_ETHEREUM);
      await wallet.sendTransaction(DEPOSIT);
      assert.deepEqual(logger.logs, [
        [
          WALLET_LOG.TRANSACTION_SENT,
          {
            txHash: TX_HASH,
            metadata: DEPOSIT.metadata,
            metadataHex: textToHex('{"depositId":"A-12","token":"ETH"}'),
          },
        ],
      ]);
    });

    it('writes data the receiving side reads back as JSON, in UTF-8', async () => {
      const { provider, wallet } = metaMaskWith(SENDS_ON_ETHEREUM);
      await wallet.sendTransaction({ ...DEPOSIT, metadata: { depositId: 'A-12', note: 'café' } });
      assert.deepEqual(readData(sentTransaction(provider).data), {
        depositId: 'A-12',
        note: 'café',
        token: 'ETH',
      });
    });

    it('writes the token alone without metadata, and the token wins over one in metadata', async () => {
      const bare = metaMaskWith(SENDS_ON_ETHEREUM);
      await bare.wallet.sendTransaction({ ...DEPOSIT, metadata: undefined });
      assert.deepEqual(readData(sentTransaction(bare.provider).data), { token: 'ETH' });

      const clashing = metaMaskWith(SENDS_ON_ETHEREUM);
      await clashing.wallet.sendTransaction({ ...DEPOSIT, metadata: { token: 'BNB' } });
      assert.deepEqual(readData(sentTransaction(clashing.provider).data), { token: 'ETH' });
    });

    it('sends a long amount exactly, to the wei', async () => {
      const amounts = [
        // Past 2^53 wei: a JS number would round it.
        ['1.234567891234567891', 1_234_567_891_234_567_891n],
        // 21 and 22 digits in wei: past the 20 Decimal.js keeps by default.
        ['100.000000000000000001', 100_000_000_000_000_000_001n],
        ['1234.567891234567891234', 1_234_567_891_234_567_891_234n],
      ] as const;
      for (const [amount, wei] of amounts) {
        const { provider, wallet } = metaMaskWith(SENDS_ON_ETHEREUM);
        await wallet.sendTransaction({ ...DEPOSIT, amount });
        assert.equal(BigInt(sentTransaction(provider).value), wei, amount);
      }
    });

    it('rounds digits past the 18th decimal half up, to the nearest wei', async () => {
      const amounts = [
        ['0.0000000000000000015', 2n],
        ['0.0000000000000000014', 1n],
      ] as const;
      for (const [amount, wei] of amounts) {
        const { provider, wallet } = metaMaskWith(SENDS_ON_ETHEREUM);
        await wallet.sendTransaction({ ...DEPOSIT, amount });
        assert.equal(BigInt(sentTransaction(provider).value), wei, amount);
      }
    });

    it("answers the wallet's own message, with no code, when the user refuses; it never throws", async () => {
      const refusal = rpcError(USER_REJECTED, 'User denied transaction signature.');
      const { wallet } = metaMaskWith({
        ...SENDS_ON_ETHEREUM,
        [RPC_METHOD.SEND_TRANSACTION]: refusal,
      });
      assert.deepEqual(await wallet.sendTransaction(DEPOSIT), {
        txHash: '',
        success: false,
        error: refusal.message,
      });
      assert.deepEqual(logger.errors, [[WALLET_LOG.TRANSACTION_FAILED, refusal]]);
    });

    it("answers TRANSACTION_FAILED's message, with no code, for a failure without a message", async () => {
      const { wallet } = metaMaskWith({
        ...SENDS_ON_ETHEREUM,
        [RPC_METHOD.SEND_TRANSACTION]: rpcError(INTERNAL_ERROR, ''),
      });
      assert.deepEqual(await wallet.sendTransaction(DEPOSIT), {
        txHash: '',
        success: false,
        error: WALLET_ERROR_MESSAGE[WALLET_ERROR.TRANSACTION_FAILED],
      });
    });

    it('answers an amount that is not a number as a failure, without asking the wallet', async () => {
      const { provider, wallet } = metaMaskWith(SENDS_ON_ETHEREUM);
      const result = await wallet.sendTransaction({ ...DEPOSIT, amount: 'half' });
      assert.equal(result.success, false);
      assert.match(result.error!, /Invalid argument/);
      assert.ok(!('code' in result));
      assert.deepEqual(provider.requests, []);
    });
  });
});
