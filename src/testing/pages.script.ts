/**
 * Loads the package on one of the `PAGE`s and prints what it found as a JSON `PageReport`: run by
 * `openPage` in a Node process of its own, as `node src/testing/pages.script.ts <page>`.
 *
 * Nothing here imports a wallet module before `window` is set up: the package reads
 * `window.ethereum` once, when it loads.
 */
import type { AbstractWallet } from '../abstract-wallet.ts';
import type { CoinbaseWallet } from '../coinbase-wallet.ts';
import type { WalletError } from '../errors.ts';
import { RPC_METHOD } from '../ethereum.ts';
import type { MetaMaskWallet } from '../metamask-wallet.ts';
import { WALLET_TYPE } from '../types.ts';
import { RecordingLogger } from './fakes.ts';
import { injectWallets, type PAGE, type PageReport, type WalletReport } from './pages.ts';

const main = async (): Promise<void> => {
  const [, , page] = process.argv as [string, string, PAGE];
  const { window, providers } = injectWallets(page);
  if (window) {
    Object.assign(globalThis, { window });
  }

  const wallets = await import('../index.ts');
  wallets.configureWallets({ logger: new RecordingLogger() });

  const labelOf = (provider: unknown): string | null =>
    providers.find((fake) => fake === provider)?.label ?? null;

  /** Whose provider the wallet's `connect()` asked, or the code of the error it threw instead. */
  const connectedThrough = async (wallet: AbstractWallet): Promise<string | null> => {
    providers.forEach((fake) => fake.requests.splice(0));
    try {
      await wallet.connect();
    } catch (error) {
      return (error as WalletError).code;
    }
    return labelOf(providers.find((fake) => fake.methods.includes(RPC_METHOD.REQUEST_ACCOUNTS)));
  };

  const reportOf = async (wallet: MetaMaskWallet | CoinbaseWallet): Promise<WalletReport> => ({
    available: wallet.isAvailable(),
    inProviderMap: wallet.isWalletInProvider(),
    provider: labelOf(wallet.getProvider()),
    library: labelOf(wallet.getLibrary()),
    connectedThrough: await connectedThrough(wallet),
  });

  const metaMask = wallets.WALLET_MAP.get(WALLET_TYPE.METAMASK) as MetaMaskWallet;
  const coinbase = wallets.WALLET_MAP.get(WALLET_TYPE.COINBASE) as CoinbaseWallet;
  const ethereum = new wallets.EthereumWallet();
  const report: PageReport = {
    installed: { ...wallets.INSTALLED_WALLETS },
    wallets: {
      [WALLET_TYPE.METAMASK]: await reportOf(metaMask),
      [WALLET_TYPE.COINBASE]: await reportOf(coinbase),
    },
    ethereum: {
      available: ethereum.isAvailable(),
      provider: labelOf(ethereum.getProvider()),
      library: labelOf(ethereum.getLibrary()),
      connectedThrough: await connectedThrough(ethereum),
    },
    setMatchesMap:
      wallets.WALLET_SET.size === wallets.WALLET_MAP.size &&
      [...wallets.WALLET_MAP.values()].every((wallet) => wallets.WALLET_SET.has(wallet)),
  };
  process.stdout.write(JSON.stringify(report));
};

void main();
