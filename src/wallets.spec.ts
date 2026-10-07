import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const entry = pathToFileURL(fileURLToPath(new URL('./index.ts', import.meta.url))).href;

/**
 * Providers as the extensions inject them: each answers EIP-1193 `request` and records the calls.
 * `window.ethereum` is read once, when the package loads, so every scenario runs in a fresh Node
 * process whose `window` is set up before the import.
 */
const PROVIDERS = `
  const calls = [];
  const provider = (name, flags = {}, answers = {}) => ({
    name,
    ...flags,
    async request({ method, params }) {
      calls.push({ wallet: name, method, params });
      const answer = answers[method];
      if (answer instanceof Error) throw answer;
      return typeof answer === 'function' ? answer(params) : answer;
    },
  });
  const notAdded = Object.assign(new Error('Unrecognized chain'), { code: 4902 });
`;

const scenario = (setup: string, body: string): any => {
  const script = `
    ${PROVIDERS}
    ${setup}
    const W = await import(${JSON.stringify(entry)});
    const result = await (async () => { ${body} })();
    process.stdout.write(JSON.stringify({ result, calls }));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
};

const installed = 'return { ...W.INSTALLED_WALLETS };';

describe('which wallet is really installed', () => {
  it('none: no window at all, as on a server', () => {
    const { result } = scenario('', installed);
    assert.ok(!result.MetaMask);
    assert.ok(!result.CoinbaseWallet);
  });

  it('MetaMask alone', () => {
    const { result } = scenario(
      `globalThis.window = { ethereum: provider('metamask', { isMetaMask: true }) };`,
      installed,
    );
    assert.equal(result.MetaMask, true);
    assert.ok(!result.CoinbaseWallet);
  });

  it('Coinbase Wallet alone: it pretends to be MetaMask too, and is still told apart', () => {
    const { result } = scenario(
      `globalThis.window = {
        ethereum: provider('coinbase', { isMetaMask: true, isCoinbaseWallet: true }),
      };`,
      installed,
    );
    assert.equal(result.MetaMask, false);
    assert.equal(result.CoinbaseWallet, true);
  });

  it('both: Coinbase takes window.ethereum and hides MetaMask in providerMap; each wallet gets its own', async () => {
    const { result, calls } = scenario(
      `const metamask = provider('metamask', { isMetaMask: true }, { eth_requestAccounts: ['0xmm'] });
       const coinbase = provider('coinbase', { isCoinbaseWallet: true }, { eth_requestAccounts: ['0xcb'] });
       globalThis.window = {
         ethereum: {
           ...coinbase,
           providerMap: new Map([['MetaMask', metamask], ['CoinbaseWallet', coinbase]]),
         },
       };`,
      `return {
         installed: { ...W.INSTALLED_WALLETS },
         metamask: await W.WALLET_MAP.get(W.WALLET_TYPE.METAMASK).connect(),
         coinbase: await W.WALLET_MAP.get(W.WALLET_TYPE.COINBASE).connect(),
       };`,
    );
    assert.deepEqual(result.installed, { MetaMask: true, CoinbaseWallet: true });
    assert.deepEqual(result.metamask, ['0xmm']);
    assert.deepEqual(result.coinbase, ['0xcb']);
    assert.deepEqual(
      calls.map((call: { wallet: string }) => call.wallet),
      ['metamask', 'coinbase'],
    );
  });
});

describe('working with the wallet', () => {
  const metamaskOnly = (answers: string) =>
    `globalThis.window = { ethereum: provider('metamask', { isMetaMask: true }, ${answers}) };`;

  it('asks MetaMask to add a network it does not know, then gives up only if that fails', () => {
    const { calls } = scenario(
      metamaskOnly('{ wallet_switchEthereumChain: notAdded, wallet_addEthereumChain: null }'),
      'await new W.MetaMaskWallet().switchNetwork(W.CHAIN_ID.POLYGON);',
    );
    assert.deepEqual(calls[1], {
      wallet: 'metamask',
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: '0x89',
          chainName: 'Polygon Mainnet',
          nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
          rpcUrls: ['https://polygon-rpc.com/'],
          blockExplorerUrls: ['https://polygonscan.com/'],
        },
      ],
    });
  });

  it('tells the user to add the network by hand in Coinbase Wallet', () => {
    const { result } = scenario(
      `globalThis.window = {
        ethereum: provider('coinbase', { isCoinbaseWallet: true }, { wallet_switchEthereumChain: notAdded }),
      };`,
      `try { await new W.CoinbaseWallet().switchNetwork(56); } catch (error) { return error.message; }`,
    );
    assert.match(result, /add it manually/);
  });

  it('sends the amount in wei and the metadata as JSON in the data field', () => {
    const { result, calls } = scenario(
      metamaskOnly("{ eth_sendTransaction: '0xhash' }"),
      `console.log = () => {};
       return new W.MetaMaskWallet().sendTransaction({
         fromAddress: '0xfrom', toAddress: '0xto', amount: '0.5', token: 'ETH', chainId: 1,
         metadata: { userId: 7 },
       });`,
    );
    assert.deepEqual(result, { txHash: '0xhash', success: true });
    const [transfer] = calls[0].params;
    assert.equal(transfer.value, `0x${(5n * 10n ** 17n).toString(16)}`);
    assert.equal(
      Buffer.from(transfer.data.slice(2), 'hex').toString('utf8'),
      JSON.stringify({ userId: 7, token: 'ETH' }),
    );
    assert.equal(transfer.gas, '0x7A120');
  });

  it('reads the balance in ether to four places', () => {
    const { result } = scenario(
      metamaskOnly(`{ eth_getBalance: '0x' + (1234567n * 10n ** 12n).toString(16) }`),
      `return new W.MetaMaskWallet().getBalance('0xme');`,
    );
    assert.equal(result, '1.2346');
  });

  it('builds explorer links, and uses the networks the app configured', () => {
    const { result } = scenario(
      '',
      `W.configureWallets({ networks: { 1: { name: 'Ethereum', icon: '/eth.png' } } });
       return {
         url: W.EthereumWallet.getExplorerUrl('0xabc', '0x38'),
         name: W.EthereumWallet.getExplorerName(137),
         fallback: W.EthereumWallet.getExplorerName(999),
         networks: new W.MetaMaskWallet().getSupportedNetworks(),
       };`,
    );
    assert.deepEqual(result, {
      url: 'https://bscscan.com/address/0xabc',
      name: 'PolygonScan',
      fallback: 'Etherscan',
      networks: { 1: { name: 'Ethereum', icon: '/eth.png' } },
    });
  });
});
