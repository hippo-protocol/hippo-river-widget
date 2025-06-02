import { Registry } from '@cosmjs/proto-signing';
import { defaultRegistryTypes } from '@cosmjs/stargate';
import { Transaction } from '../utils/type';
import { KeplerWallet } from './wallets/KeplerWallet';
import { LedgerWallet } from './wallets/LedgerWallet';
import { MetamaskWallet } from './wallets/MetamaskWallet';
import { MetamaskSnapWallet } from './wallets/MetamaskSnapWallet';
import { LeapWallet } from './wallets/LeapWallet';
import { OKXWallet } from './wallets/OKXWallet';
import { UnisatWallet } from './wallets/UnisatWallet';

export enum WalletName {
    Keplr = 'Keplr',
    Ledger = 'LedgerUSB',
    LedgerBLE = 'LedgerBLE',
    Metamask = 'Metamask',
    MetamaskSnap = 'MetamaskSnap',
    Leap = 'Leap',
    OKX = 'OKX Wallet',
    Unisat = 'UniSat Wallet',
    // None Signning
    Address = 'Address',
    NameService = 'Nameservice',
}

export interface IChain {
    chainID: string;
    name: string;
    prefix: string;
    rpcUrl: string;
    restUrl: string;
    denom: string;
    hdPath: string;
    logo: string;
    faucetUrl: string;
    explorerUrl: string;
}

export interface ConnectedWallet {
    wallet: WalletName;
    cosmosAddress: string;
    hdPath?: string;
}

export interface Account {
    address: string;
    algo: string;
    pubkey: Uint8Array;
}

export interface WalletArgument {
    chainId?: string;
    hdPath?: string;
    address?: string;
    name?: string;
    transport?: string;
    prefix?: string;
}

export interface AbstractWallet {
    name: WalletName;
    /**
     * The the accounts from the wallet (addresses)
     */
    getAccounts(): Promise<Account[]>;
    supportCoinType(coinType?: string): Promise<boolean>;
    sign(transaction: Transaction, direct?: boolean): Promise<any>;
}

export const DEFAULT_HDPATH = "m/44'/0/0'/0/0";
export const DEFAULT_LEDGER_HDPATH = "m/44'/118/0'/0/0";

export function keyType(chainId: string) {
    switch (true) {
        case chainId.search(/\w+_\d+-\d+/g) > -1: // ethermint like chain: evmos_9002-1
            return '/ethermint.crypto.v1.ethsecp256k1.PubKey';
        case chainId.startsWith('injective'):
            return '/injective.crypto.v1beta1.ethsecp256k1.PubKey';
        case chainId.startsWith('stratos'):
            return '/stratos.crypto.v1.ethsecp256k1.PubKey';
        default:
            return '/cosmos.crypto.secp256k1.PubKey';
    }
}

export function readWallet(hdPath?: string) {
    return JSON.parse(
        localStorage.getItem(hdPath || DEFAULT_HDPATH) ||
            localStorage.getItem(DEFAULT_LEDGER_HDPATH) ||
            '{}'
    ) as ConnectedWallet;
}
export function writeWallet(connected: ConnectedWallet, hdPath?: string) {
    localStorage.setItem(
        hdPath ||
            (connected.wallet === WalletName.Keplr
                ? DEFAULT_HDPATH
                : DEFAULT_LEDGER_HDPATH),
        JSON.stringify(connected)
    );
}

export function removeWallet(hdPath?: string) {
    localStorage.removeItem(hdPath || DEFAULT_HDPATH);
    localStorage.removeItem(hdPath || DEFAULT_LEDGER_HDPATH);
}

export function extractChainId(chainId: string) {
    const start = chainId.indexOf('_');
    const end = chainId.indexOf('-');
    if (end > start && start > 0) {
        return Number(chainId.substring(start + 1, end));
    }
    return 0;
}

export function createWallet(
    name: WalletName,
    arg: WalletArgument,
    registry?: Registry,
    chain?: IChain
): AbstractWallet {
    const reg = registry || new Registry(defaultRegistryTypes);
    console.info(name);

    switch (name) {
        case WalletName.OKX:
            return new OKXWallet(arg, <IChain>chain, reg);
        case WalletName.Unisat:
            return new UnisatWallet(arg, <IChain>chain, reg);
        case WalletName.Keplr:
            return new KeplerWallet(arg, reg);
        case WalletName.Ledger:
            return new LedgerWallet(arg, reg);
        case WalletName.Leap:
            return new LeapWallet(arg, reg);
        case WalletName.MetamaskSnap:
            return new MetamaskSnapWallet(arg, reg);
        case WalletName.Metamask:
            return arg.hdPath &&
                (arg.hdPath.startsWith('m/44/60') ||
                    arg.hdPath.startsWith("m/44'/60"))
                ? new MetamaskWallet(arg, reg)
                : new MetamaskSnapWallet(arg, reg);
    }
    throw new Error('No wallet connected');
}
