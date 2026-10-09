import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CHAIN_ID } from './blockchain-networks.ts';
import {
  BALANCE_FRACTION_DIGITS,
  BLOCK_TAG,
  DECIMAL_BASE,
  fromHex,
  HEX_PREFIX,
  JSON_RPC_VERSION,
  NATIVE_DECIMALS,
  NO_BALANCE,
  PROVIDER_ERROR_CODE,
  PROVIDER_EVENT,
  RPC_METHOD,
  rpcRequest,
  textToHex,
  toHex,
  TRANSFER_GAS_LIMIT,
  WEI_FRACTION_DIGITS,
  weiFromHex,
} from './ethereum.ts';

/** Gas a plain transfer of a native coin takes, data aside. */
const PLAIN_TRANSFER_GAS = 21_000;

/** Decodes JSON-RPC bytes back to text, the way the receiving side reads a transfer's data. */
const hexToText = (hex: string): string => Buffer.from(hex.slice(2), 'hex').toString('utf8');

describe('the protocol vocabulary', () => {
  it('names the JSON-RPC methods the way wallets answer to them', () => {
    assert.deepEqual(RPC_METHOD, {
      ACCOUNTS: 'eth_accounts',
      REQUEST_ACCOUNTS: 'eth_requestAccounts',
      GET_BALANCE: 'eth_getBalance',
      CHAIN_ID: 'eth_chainId',
      SEND_TRANSACTION: 'eth_sendTransaction',
      SWITCH_CHAIN: 'wallet_switchEthereumChain',
      ADD_CHAIN: 'wallet_addEthereumChain',
    });
  });

  it('names the block tag, the events and the error code the way EIP-1193 and EIP-3326 do', () => {
    assert.deepEqual(BLOCK_TAG, { LATEST: 'latest' });
    assert.deepEqual(PROVIDER_EVENT, {
      ACCOUNTS_CHANGED: 'accountsChanged',
      CHAIN_CHANGED: 'chainChanged',
      DISCONNECT: 'disconnect',
    });
    assert.deepEqual(PROVIDER_ERROR_CODE, { UNRECOGNIZED_CHAIN: 4902 });
  });
});

describe('units', () => {
  it('count a native coin as 10^18 wei', () => {
    assert.equal(BigInt(DECIMAL_BASE) ** BigInt(NATIVE_DECIMALS), 1_000_000_000_000_000_000n);
  });

  it('give a transfer more gas than a plain one takes, for the bytes of its data', () => {
    assert.ok(TRANSFER_GAS_LIMIT > PLAIN_TRANSFER_GAS);
    assert.equal(TRANSFER_GAS_LIMIT, 500_000);
  });

  it('show a balance to four places, wei to none, and a balance not read as a bare 0', () => {
    assert.equal(BALANCE_FRACTION_DIGITS, 4);
    assert.equal(WEI_FRACTION_DIGITS, 0);
    assert.equal(NO_BALANCE, '0');
    assert.equal(HEX_PREFIX, '0x');
  });
});

describe('toHex', () => {
  it('writes a number as a JSON-RPC quantity: 0x and no leading zeros', () => {
    assert.equal(toHex(0), '0x0');
    assert.equal(toHex(CHAIN_ID.POLYGON), '0x89');
    assert.equal(toHex(CHAIN_ID.AVALANCHE), '0xa86a');
    assert.equal(toHex(TRANSFER_GAS_LIMIT), '0x7a120');
  });

  it('writes an amount in wei past 2^53 exactly, from a bigint', () => {
    const wei = 1_234_567_891_234_567_891n;
    assert.equal(toHex(wei), '0x112210f4c023b6d3');
    assert.equal(BigInt(toHex(wei)), wei);
  });
});

describe('fromHex', () => {
  it('reads a hex quantity, with or without 0x', () => {
    assert.equal(fromHex('0x89'), CHAIN_ID.POLYGON);
    assert.equal(fromHex('89'), CHAIN_ID.POLYGON);
    assert.equal(fromHex('0x0'), 0);
  });

  it('answers NaN for a text with no hex digits', () => {
    assert.ok(Number.isNaN(fromHex('0x')));
    assert.ok(Number.isNaN(fromHex('polygon')));
  });
});

describe('weiFromHex', () => {
  it('reads wei exactly past 2^53, where a number rounds', () => {
    const wei = 123_456_449_999_999_999_999n;
    assert.equal(weiFromHex(toHex(wei)), wei);
    assert.notEqual(BigInt(fromHex(toHex(wei))), wei);
  });

  it('throws for a text that is not a number', () => {
    assert.throws(() => weiFromHex('0xzz'), SyntaxError);
  });
});

describe('textToHex', () => {
  it('writes a text as its UTF-8 bytes, two hex digits each', () => {
    assert.equal(textToHex('ETH'), '0x455448');
    assert.equal(textToHex(String.fromCharCode(9)), '0x09');
    assert.equal(textToHex('é'), '0xc3a9');
    assert.equal(textToHex(''), '0x');
  });

  it('reads back as the same text', () => {
    const json = JSON.stringify({ depositId: 'A-12', note: 'café 🦊' });
    assert.equal(hexToText(textToHex(json)), json);
  });
});

describe('rpcRequest', () => {
  it('builds a whole JSON-RPC 2.0 call, params given even when the method takes none', () => {
    const { id, ...call } = rpcRequest(RPC_METHOD.REQUEST_ACCOUNTS);
    assert.equal(typeof id, 'number');
    assert.deepEqual(call, {
      jsonrpc: JSON_RPC_VERSION,
      method: RPC_METHOD.REQUEST_ACCOUNTS,
      params: [],
    });
    assert.deepEqual(rpcRequest(RPC_METHOD.SWITCH_CHAIN, [{ chainId: '0x89' }]).params, [
      { chainId: '0x89' },
    ]);
  });

  it('gives each request an id of its own', () => {
    const first = rpcRequest(RPC_METHOD.CHAIN_ID).id ?? 0;
    const second = rpcRequest(RPC_METHOD.CHAIN_ID).id ?? 0;
    assert.ok(second > first);
  });
});
