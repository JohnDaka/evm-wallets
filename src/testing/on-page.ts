/**
 * A page of the spec's own for the wallets in this process. Not part of the package: the build
 * leaves `src/testing` out.
 *
 * The package reads `window.ethereum` once, when it loads, and Node has no window. Only three
 * methods of `EthereumWallet` see what it read: `isAvailable()`, `getProvider()` and
 * `getLibrary()`. Every wallet stands on them (MetaMask's and Coinbase's detection through
 * `super.isAvailable()` and `getLibrary()`), so answering them with a fake puts every wallet object
 * in this process on a page of the spec's own, and the rest of the code runs as it is. The three
 * reads themselves run for real in the detection specs, which load the package on pages of their
 * own (`pages.ts`).
 *
 * Imports `EthereumWallet` itself, so `pages.script.ts` never imports this module: there the
 * package must not load before `window` is set up.
 */
import type { EthereumProvider } from '../ethereum.ts';
import { EthereumWallet } from '../ethereum-wallet.ts';

/** `EthereumWallet`'s methods as the package has them, to give back after a spec. */
const PACKAGE_METHODS = Object.getOwnPropertyDescriptors(EthereumWallet.prototype);

/**
 * Puts `injected` on the page as `window.ethereum`, for every wallet object in this process, until
 * `leavePage()`.
 *
 * @param injected - What the extensions put on `window.ethereum`; `undefined` for no wallet.
 * @returns `injected`, to hold on to.
 */
export const putOnPage = <Injected extends EthereumProvider | undefined>(
  injected: Injected,
): Injected => {
  Object.assign(EthereumWallet.prototype, {
    isAvailable: () => !!injected,
    getProvider: () => injected,
    getLibrary: () => injected,
  });
  return injected;
};

/** Gives `EthereumWallet` its own reads of `window.ethereum` back: in Node, no page at all. */
export const leavePage = (): void => {
  Object.defineProperties(EthereumWallet.prototype, PACKAGE_METHODS);
};
