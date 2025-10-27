import { fromBase64, fromBech32, toHex } from '@cosmjs/encoding';
import {
    Registry,
    TxBodyEncodeObject,
    makeAuthInfoBytes,
    makeSignDoc,
} from '@cosmjs/proto-signing';
import {
    AbstractWallet,
    Account,
    WalletArgument,
    WalletName,
    keyType,
} from '../Wallet';
import { Transaction } from '../../utils/type';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import { Any } from 'cosmjs-types/google/protobuf/any';
import { PubKey } from 'cosmjs-types/cosmos/crypto/secp256k1/keys';
import { SignMode } from 'cosmjs-types/cosmos/tx/signing/v1beta1/signing';
import { AminoTypes, createDefaultAminoConverters } from '@cosmjs/stargate';
import {
    makeSignDoc as makeSignDocAmino,
} from '@cosmjs/amino';
import { createWasmAminoConverters } from '@cosmjs/cosmwasm-stargate';

/**
 * Gate Wallet implementation for Cosmos chains
 * 
 * Gate Wallet is fully compatible with Keplr API through window.gatewallet.keplr
 * 
 * @see https://www.gate.io/web3
 */
export class GateWallet implements AbstractWallet {
    name: WalletName.GateWallet;
    chainId: string;
    registry: Registry;
    conf: WalletArgument;
    aminoTypes = new AminoTypes({
        ...createDefaultAminoConverters(),
        ...createWasmAminoConverters(),
    });
    
    constructor(arg: WalletArgument, registry: Registry) {
        console.log('🦛 [GateWallet] Constructor called', {
            chainId: arg.chainId,
            hasWindow: typeof window !== 'undefined',
            hasGateWallet: typeof window !== 'undefined' && !!window.gatewallet,
            hasKeplr: typeof window !== 'undefined' && !!window.gatewallet?.keplr
        });
        
        this.chainId = arg.chainId || 'cosmoshub';
        // @ts-ignore
        if (!window.gatewallet?.keplr) {
            console.error('❌ [GateWallet] Gate Wallet not found!', {
                gatewallet: window.gatewallet,
                keplr: window.keplr
            });
            throw new Error('Please install Gate Wallet extension');
        }
        this.registry = registry;
        this.conf = arg;
        console.log('✅ [GateWallet] Constructor completed');
    }

    async getAccounts(): Promise<Account[]> {
        console.log('🦛 [GateWallet] getAccounts called', {
            chainId: this.chainId
        });
        
        try {
            // @ts-ignore
            console.log('🦛 [GateWallet] Calling enable...');
            await window.gatewallet.keplr.enable(this.chainId);
            console.log('✅ [GateWallet] Enable successful');
            
            // @ts-ignore
            console.log('🦛 [GateWallet] Getting offline signer...');
            const offlineSigner = window.gatewallet.keplr.getOfflineSigner(this.chainId);
            console.log('✅ [GateWallet] Got offline signer');
            
            console.log('🦛 [GateWallet] Getting accounts...');
            const accounts = await offlineSigner.getAccounts();
            console.log('✅ [GateWallet] Got accounts:', accounts);
            
            return accounts;
        } catch (error) {
            console.error('❌ [GateWallet] Error in getAccounts:', error);
            throw error;
        }
    }
    
    supportCoinType(coinType?: string | undefined): Promise<boolean> {
        return Promise.resolve(true);
    }
    
    isEthermint() {
        return this.conf.hdPath && this.conf.hdPath.startsWith("m/44'/60");
    }
    
    async sign(transaction: Transaction, direct?: boolean): Promise<TxRaw> {
        // sign wasm tx with signDirect
        if (
            transaction.messages.findIndex((x) =>
                x.typeUrl.startsWith('/cosmwasm.wasm')
            ) > -1 ||
            direct
        ) {
            return this.signDirect(transaction);
        }
        return this.signAmino(transaction);
    }
    
    // @deprecated use signAmino instead
    // because signDirect is not supported ledger wallet
    async signDirect(transaction: Transaction): Promise<TxRaw> {
        const accouts = await this.getAccounts();
        const hex = toHex(fromBech32(transaction.signerAddress).data);
        const accountFromSigner = accouts.find(
            (account) => toHex(fromBech32(account.address).data) === hex
        );
        if (!accountFromSigner) {
            throw new Error('Failed to retrieve account from signer');
        }
        const pubkey = Any.fromPartial({
            typeUrl: keyType(transaction.chainId),
            value: PubKey.encode({
                key: accountFromSigner.pubkey,
            }).finish(),
        });
        const txBodyEncodeObject: TxBodyEncodeObject = {
            typeUrl: '/cosmos.tx.v1beta1.TxBody',
            value: {
                messages: transaction.messages,
                memo: transaction.memo,
            },
        };
        const txBodyBytes = this.registry.encode(txBodyEncodeObject);
        const gasLimit = Number(transaction.fee.gas);
        const authInfoBytes = makeAuthInfoBytes(
            [{ pubkey, sequence: transaction.signerData.sequence }],
            transaction.fee.amount,
            gasLimit,
            transaction.fee.granter,
            transaction.fee.payer
        );
        const signDoc = makeSignDoc(
            txBodyBytes,
            authInfoBytes,
            transaction.chainId,
            transaction.signerData.accountNumber
        );

        // @ts-ignore
        const offlineSigner = window.gatewallet.keplr.getOfflineSigner(this.chainId);
        const { signature, signed } = await offlineSigner.signDirect(
            transaction.signerAddress,
            signDoc
        );
        return TxRaw.fromPartial({
            bodyBytes: signed.bodyBytes,
            authInfoBytes: signed.authInfoBytes,
            signatures: [fromBase64(signature.signature)],
        });
    }

    async signAmino(tx: Transaction): Promise<TxRaw> {
        const accouts = await this.getAccounts();
        const hex = toHex(fromBech32(tx.signerAddress).data);
        const accountFromSigner = accouts.find(
            (account) => toHex(fromBech32(account.address).data) === hex
        );
        if (!accountFromSigner) {
            throw new Error('Failed to retrieve account from signer');
        }
        const pubkey = Any.fromPartial({
            typeUrl: keyType(tx.chainId),
            value: PubKey.encode({
                key: accountFromSigner.pubkey,
            }).finish(),
        });
        const signMode = SignMode.SIGN_MODE_LEGACY_AMINO_JSON;
        const msgs = tx.messages.map((msg) => this.aminoTypes.toAmino(msg));
        const signDoc = makeSignDocAmino(
            msgs,
            tx.fee,
            tx.chainId,
            tx.memo,
            tx.signerData.accountNumber,
            tx.signerData.sequence
        );

        // @ts-ignore
        const offlineSigner = window.gatewallet.keplr.getOfflineSigner(this.chainId);
        const { signature, signed } = await offlineSigner.signAmino(
            tx.signerAddress,
            signDoc
        );

        const signedTxBody = {
            messages: signed.msgs.map((msg) => this.aminoTypes.fromAmino(msg)),
            memo: signed.memo,
        };
        const signedTxBodyEncodeObject: TxBodyEncodeObject = {
            typeUrl: '/cosmos.tx.v1beta1.TxBody',
            value: signedTxBody,
        };
        const signedTxBodyBytes = this.registry.encode(
            signedTxBodyEncodeObject
        );

        const signedGasLimit = Number(signed.fee.gas);
        const signedSequence = Number(signed.sequence);
        const signedAuthInfoBytes = makeAuthInfoBytes(
            [{ pubkey, sequence: signedSequence }],
            signed.fee.amount,
            signedGasLimit,
            signed.fee.granter,
            signed.fee.payer,
            signMode
        );
        return TxRaw.fromPartial({
            bodyBytes: signedTxBodyBytes,
            authInfoBytes: signedAuthInfoBytes,
            signatures: [fromBase64(signature.signature)],
        });
    }
}
