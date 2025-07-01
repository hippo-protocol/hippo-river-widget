<script lang="ts" setup>
import { PropType, computed, ref } from 'vue';
import { getStakingParam, getDenomTraces } from '../../../utils/http';
import { Coin, CoinMetadata } from '../../../utils/type';
import { ibcData } from 'chain-registry';
import { IBCPath } from '@ping-pub/chain-registry-client/dist/types';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { TokenUnitConverter } from '../../../utils/TokenUnitConverter';
import { uniqBy } from 'lodash';
dayjs.extend(utc);

const props = defineProps({
    endpoint: { type: String, required: true },
    sender: { type: String, required: true },
    balances: Object as PropType<Coin[]>,
    metadata: Object as PropType<Record<string, CoinMetadata>>,
    params: String,
});
const chainName = ref('hippoprotocol')

const amount = ref('');
const amountDenom = ref('');
const recipient = ref('');
const denom = ref('');
const dest = ref('');
const chains = ref([] as (IBCPath & { channels: any[] })[]);
const sourceChain = ref(
    {} as { channel_id: string; port_id: string } | undefined
);
const ibcDenomTraces = ref(
    {} as Record<string, { path: string; base_denom: string }>
);


const msgs = computed(() => {
    const timeout = dayjs().add(1, 'hour');
    const convert = new TokenUnitConverter(props.metadata);
    return [
        {
            typeUrl: '/ibc.applications.transfer.v1.MsgTransfer',
            value: {
                sourcePort: sourceChain.value?.port_id || '',
                sourceChannel: sourceChain.value?.channel_id || '',
                token: convert.displayToBase(denom.value, {
                    amount: String(amount.value),
                    denom: amountDenom.value,
                }),
                sender: props.sender,
                receiver: recipient.value,
                timeoutTimestamp: String(timeout.utc().valueOf() * 1000000),
            },
        },
    ];
});
const destDisabled = computed(() => {
    const disable = denom.value.startsWith('ibc/');
    if (disable) dest.value = '';
    return disable;
});

function selectDest() {
    const ibcPath = chains.value.find(item => item.path === dest.value);
    if (!ibcPath) {
        sourceChain.value = {} as { channel_id: string; port_id: string };
        return;
    }
    if (ibcPath.from === chainName.value) {
        sourceChain.value = {
            channel_id: ibcPath.channels[0].chain1.channelId,
            port_id: ibcPath.channels[0].chain1.portId,
        };
    } else {
        sourceChain.value = {
            channel_id: ibcPath.channels[0].chain2.channelId,
            port_id: ibcPath.channels[0].chain2.portId,
        };

    }
}

function updateIBCToken() {
    const hash = String(denom.value).replace('ibc/', '');
    if (!denom.value.startsWith('ibc/')) return;
    if (ibcDenomTraces.value[denom.value]) {
        const trace = ibcDenomTraces.value[denom.value];
        const split = trace.path.split('/');
        sourceChain.value = {
            channel_id: split[1],
            port_id: split[0],
        };
    } else {
        getDenomTraces(props.endpoint, hash).then((trace) => {
            ibcDenomTraces.value[denom.value] = trace.denom_trace;
            const split = trace.denom_trace.path.split('/');
            sourceChain.value = {
                channel_id: split[1],
                port_id: split[0],
            };
        });
    }
}

const available = computed(() => {
    const base = props.balances?.find((x) => x.denom === denom.value) || {
        amount: '0',
        denom: '-',
    };
    const convert = new TokenUnitConverter(props.metadata);
    return {
        base,
        display: convert.baseToUnit(base, amountDenom.value),
    };
});

const showBalances = computed(() => {
    const convert = new TokenUnitConverter(props.metadata);
    return (
        props.balances?.map((b) => ({
            base: b,
            display: convert.baseToDisplay(b),
        })) || []
    );
});

const units = computed(() => {
    if (!props.metadata || !props.metadata[denom.value]) {
        amountDenom.value = denom.value;
        return [{ denom: denom.value, exponent: 0, aliases: [] }];
    }
    const list = props.metadata[denom.value].denom_units.sort(
        (a, b) => b.exponent - a.exponent
    );
    if (list.length > 0) amountDenom.value = list[0].denom;
    return list;
});

const isValid = computed(() => {
    let ok = true;
    let error = '';
    if (!sourceChain.value?.channel_id || !sourceChain.value.port_id) {
        ok = false;
        error = 'Destination chain is empty';
    }
    if (!recipient.value) {
        ok = false;
        error = 'Recipient is empty';
    }
    if (!(Number(amount.value) > 0)) {
        ok = false;
        error = 'Amount should be great than 0';
    }
    return { ok, error };
});

function initial() {
    if (props.endpoint.includes('testnet')) {
        chainName.value = 'hippoprotocoltestnet'
    }
    chains.value = uniqBy(ibcData.filter(ibc => ibc.chain1.chainName === chainName.value || ibc.chain2.chainName === chainName.value).map(data => ({
        from: data.chain1.chainName,
        to: data.chain2.chainName,
        path: `${data.chain1.chainName}-${data.chain2.chainName}`,
        channels: data.channels
    })), 'path'); // It seems there are duplicate datas in the ibcData

    getStakingParam(props.endpoint).then((x) => {
        denom.value = x.params.bond_denom;
    });
}

function formatDenom(v: any) {
    return String(v).substring(0, 10)
}

defineExpose({ msgs, isValid, initial });
</script>
<template>
    <div>
        <div class="form-control">
            <label class="label">
                <span class="label-text">Sender</span>
            </label>
            <input :value="sender" type="text"
                class="text-gray-600 dark:text-white input border !border-gray-300 dark:!border-gray-600" />
        </div>
        <div class="form-control">
            <label class="label">
                <span class="label-text">Balances</span>
            </label>
            <select v-model="denom" class="select select-bordered dark:text-white" @change="updateIBCToken">
                <option value="">Select a token</option>
                <option v-for="{ base, display } in showBalances" :value="base.denom">
                    {{ display.amount }} {{ formatDenom(display.denom) }}
                </option>
            </select>
        </div>
        <div class="form-control">
            <label class="label">
                <span class="label-text">Destination</span>
                <span v-if="sourceChain" class="text-xs">{{ sourceChain.channel_id }}/{{
                    sourceChain.port_id
                    }}</span>
            </label>
            <select v-model="dest" class="select select-bordered capitalize dark:text-white" @change="selectDest"
                :disabled="destDisabled">
                <option value="">Select Destination</option>
                <option v-for="v in chains" :value="v.path">
                    {{ v.from === chainName ? v.to : v.from }}
                </option>
            </select>
        </div>
        <div class="form-control">
            <label class="label">
                <span class="label-text">Recipient</span>
            </label>
            <input v-model="recipient" type="text"
                class="input border border-gray-300 dark:border-gray-600 dark:text-white" />
        </div>
        <div class="form-control">
            <label class="label">
                <span class="label-text">Amount</span>
                <span>
                    {{ available.display.amount }} {{ formatDenom(available.display.denom) }}
                </span>
            </label>
            <label class="input-group">
                <input v-model="amount" type="number" :placeholder="`Available: ${available?.display.amount}`"
                    class="input border border-gray-300 dark:border-gray-600 w-full dark:text-white" />
                <select v-model="amountDenom" class="select select-bordered dark:text-white">
                    <option v-for="u in units" :value="u.denom">{{ formatDenom(u.denom) }}</option>
                </select>
            </label>
        </div>
    </div>
</template>
