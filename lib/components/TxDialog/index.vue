<script setup lang="ts">
import { ref, computed } from 'vue';
import {
    getAccount,
    getAccountInfo,
    getBalance,
    getBalanceMetadata,
    getIBCDenomMetadata,
    getLatestBlock,
    getTxByHash,
} from '../../utils/http';
import { base64ToHex } from '../../utils/format';
import { BroadcastMode, Coin, CoinMetadata } from '../../utils/type';
import { WalletName, readWallet } from '../../../lib/wallet/Wallet';
import { UniClient } from '../../../lib/wallet/UniClient';

// cosmos sdk messages
import Delegate from './messages/Delegate.vue';
import Deposit from './messages/Deposit.vue';
import Redelegate from './messages/Redelegate.vue';
import Send from './messages/Send.vue';
import Transfer from './messages/Transfer.vue';
import Unbond from './messages/Unbond.vue';
import Vote from './messages/Vote.vue';
import Withdraw from './messages/Withdraw.vue';
import WithdrawCommission from './messages/WithdrawCommission.vue';
import Propose from './messages/Propose.vue';
import MultiSend from './messages/MultiSend.vue';

// wasm msgs
import StoreCode from './wasm/StoreCode.vue';
import ExecuteContract from './wasm/ExecuteContract.vue';
import InstantiateContract from './wasm/InstantiateContract.vue';
import ChainRegistryClient from '@ping-pub/chain-registry-client';
import MigrateContract from './wasm/MigrateContract.vue';
import UpdateAdmin from './wasm/UpdateAdmin.vue';
import ClearAdmin from './wasm/ClearAdmin.vue';
import { TokenUnitConverter } from '../../utils/TokenUnitConverter';

// custom messages
import CommunityPoolSpend from './messages/CommunityPoolSpend.vue';
import UpdateParams from './messages/UpdateParams.vue';

const props = defineProps({
    type: String,
    endpoint: { type: String, required: true },
    sender: { type: String, required: true },
    hdPath: String,
    registryName: String,
    params: String,
});

const directSignMessages = ['community_pool_spend', 'update_params', 'transfer']
const msgType = computed(() => {
    switch (props.type?.toLowerCase()) {
        case 'send':
            return Send;
        case 'multisend':
            return MultiSend;
        case 'propose':
            return Propose;
        case 'delegate':
            return Delegate;
        case 'withdraw':
            return Withdraw;
        case 'withdraw_commission':
            return WithdrawCommission;
        case 'redelegate':
            return Redelegate;
        case 'transfer':
            return Transfer;
        case 'unbond':
            return Unbond;
        case 'vote':
            return Vote;
        case 'deposit':
            return Deposit;
        case 'wasm_store_code':
            return StoreCode;
        case 'wasm_execute_contract':
            return ExecuteContract;
        case 'wasm_instantiate_contract':
            return InstantiateContract;
        case 'wasm_migrate_contract':
            return MigrateContract;
        case 'wasm_update_admin':
            return UpdateAdmin;
        case 'wasm_clear_admin':
            return ClearAdmin;
        case 'community_pool_spend':
            return CommunityPoolSpend;
        // case 'update_params':
        //     return UpdateParams
        default:
            return Send;
    }
});

const advance = ref(false);
const sending = ref(false);
const balance = ref([] as Coin[]);
const metadatas = ref({} as Record<string, CoinMetadata>);
const emit = defineEmits(['submited', 'confirmed', 'view']);

// functional variable
const p = ref({} as { fees: Coin });
const view = ref('input'); // input, submitting
const open = ref(false);
const error = ref('');

// input field
const msgBox = ref({
    msgs: [],
    isValid: { ok: false, error: '' },
    initial: function () { },
});
const feeAmount = ref(1);
const feeDenom = ref('hp');
const gasInfo = ref(200000);
const memo = ref('');
const chainId = ref('hippo-protocol-1');
const broadcast = ref(BroadcastMode.SYNC);

const convert = new TokenUnitConverter(
    // below can be simplied to props.metadata after we add hp in metadata
    {
        ahp: {
            name: 'hp',
            description: 'The native staking token of the Hippo Protocol.',
            denom_units: [
                {
                    denom: 'ahp',
                    exponent: 0,
                    aliases: [],
                },
                {
                    denom: 'hp',
                    exponent: 18,
                    aliases: [],
                },
            ],
            base: 'ahp',
            display: 'hp',
            symbol: 'hp',
        },
    }
);

async function initData() {
    if (open.value && props.endpoint && props.sender) {
        metadatas.value = {};
        view.value = 'input';
        p.value = JSON.parse(props.params || '{}');
        getAccountInfo(props.endpoint, props.sender).then((res) => {
            if (!res.info?.pub_key) {
                memo.value = 'did on board';
            }
            else {
                memo.value = `did:hp:${base64ToHex(res.info.pub_key.key)}`;
            }
        });
        const fee = convert.baseToUnit(p.value?.fees || { amount: '1', denom: 'hp' }, 'hp') // 1HP for default fee
        feeAmount.value = Number(fee.amount);
        feeDenom.value = fee.denom

        try {
            getBalance(props.endpoint, props.sender).then((x) => {
                balance.value = x.balances;
                x.balances?.forEach((coin) => {
                    // only load for native tokens
                    if (coin.denom.length < 12)
                        getBalanceMetadata(props.endpoint, coin.denom)
                            .then((meta) => {
                                if (meta.metadata) {
                                    if (meta.metadata.base === 'ahp' && meta.metadata.denom_units.length === 1 && meta.metadata.denom_units[0].denom === 'ahp') {
                                        meta.metadata = {
                                            ...meta.metadata,
                                            denom_units: [
                                                ...meta.metadata.denom_units,
                                                {
                                                    denom: 'hp',
                                                    exponent: 18,
                                                    aliases: [],
                                                }
                                            ],
                                            display: 'hp'
                                        }
                                    }
                                    metadatas.value[coin.denom] = meta.metadata;
                                }
                            })
                            .catch(() => { });
                    if (coin.denom.startsWith('ibc/')) {
                        getIBCDenomMetadata(coin.denom)
                            .then((meta) => {
                                if (meta) metadatas.value[coin.denom] = meta;
                            })
                            .catch(() => { });
                    }
                });
            });

            // load metadata from registry
            if (
                props.registryName &&
                Object.keys(metadatas.value).length === 0
            ) {
                const client = new ChainRegistryClient();
                client
                    .fetchAssetsList(props.registryName.includes('testnet') && !props.registryName.startsWith('testnets/') ? `testnets/${props.registryName}` : props.registryName)
                    .then((x) => {
                        x.assets.forEach((a) => {
                            if (a.base === 'ahp' && a.denom_units.length === 1 && a.denom_units[0].denom === 'ahp') {
                                a = {
                                    ...a,
                                    denom_units: [
                                        ...a.denom_units,
                                        {
                                            denom: 'hp',
                                            exponent: 18,
                                        }
                                    ],
                                    display: 'hp',
                                }
                            }
                            metadatas.value[a.base] = a as CoinMetadata;
                        });
                    })
                    .catch(() => {
                        console.log(
                            `Chain: ${props.registryName} was not found on Cosmos Registry`
                        );
                    });
            }
            getLatestBlock(props.endpoint).then((x) => {
                chainId.value = x.block.header.chain_id;
            });

            // Every sub component should have a initial function
            if (msgBox.value && msgBox.value.initial) msgBox.value.initial();

        } catch (err) {
            error.value = String(err);
        }
        sending.value = false;
    }
}
async function sendTx() {
    try {
        if (!props.sender) throw new Error('Sender should not be empty!');
        if (!props.endpoint) throw new Error('Endpoint is empty');
        if (!feeDenom.value) throw new Error('Fee Denom is empty');
        if (!msgBox.value.isValid.ok)
            throw new Error(msgBox.value.isValid.error);

        sending.value = true; // disable sending btn

        const acc = await getAccount(props.endpoint, props.sender);
        const messages = msgBox.value.msgs;

        const tx = {
            chainId: chainId.value,
            signerAddress: props.sender,
            messages,
            fee: {
                gas: '400000',
                amount: [
                    convert.displayToBase('ahp', { amount: feeAmount.value.toString(), denom: feeDenom.value }),
                ],
            },
            memo: memo.value,
            signerData: {
                accountNumber: Number(acc.account.account_number),
                sequence: Number(acc.account.sequence),
                chainId: chainId.value,
            },
        };
        console.log('tx:', tx);
        const current = readWallet();
        const wallet = current?.wallet ? current.wallet : WalletName.Keplr;
        console.info('wallet:', current);
        const client = new UniClient(wallet, {
            chainId: chainId.value,
        });

        if (!advance.value) {
            await client
                .simulate(props.endpoint, tx, broadcast.value)
                .then((gas) => {
                    // update tx gas
                    tx.fee.gas = (gas * 1.25).toFixed();
                })
                .catch(() => {
                    advance.value = true;
                });
        } else {
            tx.fee.gas = gasInfo.value.toString();
        }

        const txRaw = await client.sign(tx, directSignMessages.includes(props.type ?? ''));
        const response = await client.broadcastTx(
            props.endpoint,
            txRaw,
            broadcast.value
        );
        // show submitting view
        hash.value = response.tx_response.txhash;
        showResult(response.tx_response.txhash);

        emit('submited', {
            hash: response.tx_response.txhash,
            eventType: props.type,
        });
    } catch (e) {
        console.error(e)
        sending.value = false;
        error.value = String(e);
    }
}

function viewTransaction() {
    emit('view', {
        hash: hash.value,
        eventType: props.type,
    });
    open.value = false;
}

function showTitle() {
    return (props.type || 'Sending Transaction').replace(/\_/g, ' ');
}

const delay = ref(0);
const step = ref(0);
const msg = ref('');
const sleep = 6000;
const hash = ref('');

function showResult(hash: string) {
    view.value = 'submitting';
    delay.value = 1;
    step.value = 20;
    error.value = '';
    msg.value = 'Proccessing...';
    setTimeout(() => {
        fetchTx(hash);
    }, sleep);
}

function fetchTx(tx: string) {
    delay.value += 1;
    step.value += 20;
    getTxByHash(props.endpoint, tx)
        .then((res) => {
            step.value = 100;
            if (res.tx_response.code > 0) {
                error.value = res.tx_response.raw_log;
            } else {
                msg.value = `Congratulations! ${showTitle()} completed successfully.`;
                emit('confirmed', { hash: tx, eventType: props.type });
            }
        })
        .catch(() => {
            if (delay.value < 5) {
                setTimeout(() => fetchTx(tx), sleep);
            } else {
                error.value = 'Timeout';
            }
        });
}

const onOpenPopup = () => {
    if (open.value) {
        error.value = ''
        initData()
    }
}
</script>
<template>
    <div class="text-gray-600">
        <!-- Put this part before </body> tag -->
        <input v-model="open" type="checkbox" :id="type" class="modal-toggle" @change="onOpenPopup()" />
        <label :for="type" class="modal cursor-pointer">
            <label class="modal-box relative p-5" :class="{
                '!w-11/12 !max-w-5xl': String(type).startsWith('wasm'),
            }" for="">
                <label :for="type" class="btn btn-sm btn-circle absolute right-4 top-4">✕</label>
                <h3 class="text-lg font-bold capitalize dark:text-gray-300">
                    {{ showTitle() }}
                </h3>

                <div v-if="!sender" class="text-center h-16 items-center">
                    No wallet connected!
                </div>

                <div v-if="sender">
                    <div v-if="view === 'input'">
                        <component :is="msgType" ref="msgBox" :endpoint="endpoint" :sender="sender" :balances="balance"
                            :metadata="metadatas" :params="props.params" />
                        <form class="space-y-6" action="#" method="POST">
                            <div :class="advance ? '' : 'hidden'">
                                <div class="form-control">
                                    <label class="label">
                                        <span class="label-text">Fees</span>
                                    </label>
                                    <label class="input-group flex items-center">
                                        <input v-model="feeAmount" type="text" placeholder="0.001"
                                            class="input border border-gray-300 dark:border-gray-600 flex-1 w-0 dark:text-gray-300" />
                                        <select v-model="feeDenom"
                                            class="select input border border-gray-300 dark:border-gray-600 w-[200px]">
                                            <option selected>
                                                hp
                                            </option>
                                        </select>
                                    </label>
                                </div>
                                <div class="form-control">
                                    <label class="label">
                                        <span class="label-text">Gas</span>
                                    </label>
                                    <input v-model="gasInfo" type="number" placeholder="2000000"
                                        class="input border border-gray-300 dark:border-gray-600 dark:text-gray-300" />
                                </div>
                                <div class="form-control">
                                    <label class="label">
                                        <span class="label-text">Memo</span>
                                    </label>
                                    <input v-model="memo" type="text" placeholder="Memo"
                                        class="input border border-gray-300 dark:border-gray-600 dark:text-gray-300" />
                                </div>
                                <div class="form-control">
                                    <label class="label">
                                        <span class="label-text">Broadcast Mode</span>
                                    </label>
                                    <select v-model="broadcast"
                                        class="select input border border-gray-300 dark:border-gray-600 w-[200px]">
                                        <option :value="BroadcastMode.SYNC">
                                            Sync
                                        </option>
                                        <option :value="BroadcastMode.ASYNC">
                                            Async
                                        </option>
                                        <option :value="BroadcastMode.BLOCK">
                                            Block
                                        </option>
                                    </select>
                                </div>
                            </div>
                        </form>

                        <div v-show="error" class="mt-5 alert alert-error shadow-lg" @click="error = ''">
                            <div class="flex">
                                <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6"
                                    fill="none" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>{{ error }}.</span>
                            </div>
                        </div>

                        <div class="modal-action flex justify-between items-center">
                            <div class="flex items-center cursor-pointer">
                                <input v-model="advance" type="checkbox" :id="`${type}-advance`"
                                    class="checkbox checkbox-sm checkbox-primary mr-2" /><label :for="`${type}-advance`"
                                    class="cursor-pointer dark:text-gray-400">Advance</label>
                            </div>
                            <button class="btn btn-primary" @click="sendTx()" :disabled="sending">
                                <span v-if="sending" class="loading loading-spinner"></span>
                                Send
                            </button>
                        </div>
                    </div>

                    <div v-if="view === 'submitting'">
                        <div class="my-10">
                            <div v-if="error" class="my-5 text-center text-red-500">
                                {{ error }}
                            </div>
                            <div v-else class="my-5 text-center text-lg text-green-500">
                                {{ msg }}
                            </div>
                            <div class="overflow-hidden h-5 mb-2 text-xs flex rounded bg-green-100">
                                <div :style="`width: ${step}%`"
                                    class="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-green-400">
                                </div>
                            </div>
                            <div class="flex items-center justify-between">
                                <div>
                                    <span
                                        class="text-xs font-semibold inline-block py-1 px-2 rounded text-gray-600 dark:text-white">
                                        Submitted
                                    </span>
                                </div>
                                <div class="text-right">
                                    <span class="text-xs font-semibold inline-block text-gray-600 dark:text-white">
                                        {{ step }}%
                                    </span>
                                </div>
                            </div>
                        </div>
                        <label class="mt-10 flex justify-center text-sm" @click="viewTransaction">
                            <span>View Transaction</span>
                        </label>
                    </div>
                </div>
            </label>
        </label>
    </div>
</template>
<script lang="ts">
export default {
    name: 'TxDialog',
};
</script>
