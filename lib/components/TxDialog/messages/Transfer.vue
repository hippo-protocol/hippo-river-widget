<script lang="ts" setup>
import { PropType, computed, ref } from 'vue';
import { getStakingParam, getDenomTraces, getIBCChannels, getIBCConnections, getIBCClientState } from '../../../utils/http';
import { Coin, CoinMetadata } from '../../../utils/type';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { TokenUnitConverter } from '../../../utils/TokenUnitConverter';
import { MsgTransfer } from 'cosmjs-types/ibc/applications/transfer/v1/tx';

dayjs.extend(utc);

interface Channel {
    state: string
    ordering: string
    counterparty: {
        port_id: string
        channel_id: string
    }
    connection_hops: string[]
    version: string
    port_id: string
    channel_id: string
    upgrade_sequence: string
}
interface Connection {
    id: string
    client_id: string
    versions: {
        identifier: string
        features: string[]
    }[]
    state: string
    counterparty: {
        client_id: string
        connection_id: string
        prefix: {
            key_prefix: string
        }
    }
    delay_period: string
}

interface Path {
    from: string
    to: string
    port: string
    channel: string
}
const props = defineProps({
    endpoint: { type: String, required: true },
    sender: { type: String, required: true },
    balances: Object as PropType<Coin[]>,
    metadata: Object as PropType<Record<string, CoinMetadata>>,
    params: String,
    chainId: String,
});

const amount = ref('');
const amountDenom = ref('hp')
const recipient = ref('');
const denom = ref('');
const dest = ref({} as Path);
const chains = ref([] as Path[]);
const channels = ref([] as Channel[])
const connections = ref([] as Connection[]);
const sourceChain = ref(
    {} as { channel_id: string; port_id: string } | undefined
);
const ibcDenomTraces = ref(
    {} as Record<string, { path: string; base_denom: string }>
);

const convert = new TokenUnitConverter(
    // below can be simplied to props.metadata if metadata api works.
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

const msgs = computed(() => {
    const timeout = dayjs().add(1, 'hour');
    return [
        {
            typeUrl: MsgTransfer.typeUrl,
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
    if (disable) dest.value = {} as any;
    return disable;
});

function updateIBCToken() {
    const hash = String(denom.value).replace('ibc/', '');
    if (!denom.value.startsWith('ibc/')) {
        amountDenom.value = 'hp';
        return;
    }
    if (ibcDenomTraces.value[denom.value]) {
        const trace = ibcDenomTraces.value[denom.value];
        const split = trace.path.split('/');
        sourceChain.value = {
            channel_id: split[1],
            port_id: split[0],
        };
        amountDenom.value = denom.value
    } else {
        getDenomTraces(props.endpoint, hash).then((trace) => {
            ibcDenomTraces.value[denom.value] = trace.denom_trace;
            const split = trace.denom_trace.path.split('/');
            sourceChain.value = {
                channel_id: split[1],
                port_id: split[0],
            };
            amountDenom.value = denom.value
        });
    }
}

const available = computed(() => {
    const base = props.balances?.find((x) => x.denom === denom.value) || {
        amount: '0',
        denom: '-',
    };
    return {
        base,
        display: convert.baseToUnit(base, amountDenom.value),
    };
});

const showBalances = computed(() => {
    return (
        props.balances?.map((b) => ({
            base: b,
            display: convert.baseToDisplay(b),
        })) || []
    );
});

const units = computed(() => {
    if (!denom.value.startsWith('ibc/')) {
        return [{ denom: 'hp', exponent: 18, aliases: [] }];
    }
    return [
        {
            denom: denom.value,
        },
    ];
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

const selectDest = () => {
    const source = channels.value.find((channel: Channel) =>
        (channel.port_id === 'transfer' && channel.channel_id === dest.value.channel)
    )
    if (!source) { dest.value = {} as Path; return; }
    sourceChain.value = {
        channel_id: source.channel_id,
        port_id: source.port_id,
    };
}

function initial() {
    connections.value = []
    channels.value = []
    chains.value = []
    getIBCConnections(props.endpoint).then((conectionRes) => {
        connections.value = conectionRes.connections;

        getIBCChannels(props.endpoint).then((channelRes) => {
            channels.value = channelRes.channels;
            channelRes.channels.forEach(async (channel: Channel) => {
                if (channel.port_id === 'transfer') {
                    const channelId = channel.channel_id;
                    const connection = (conectionRes.connections as Connection[]).find(
                        (c) => c.id === channel.connection_hops[0]
                    )
                    if (!connection) return;
                    const clientId = connection.client_id;
                    const client = await getIBCClientState(props.endpoint, clientId);
                    if (!client.client_state) return;
                    const targetChainId = client.client_state.chain_id;
                    if (!props.chainId) return;
                    chains.value.push({
                        from: props.chainId,
                        to: targetChainId,
                        port: channel.port_id,
                        channel: channelId,
                    });
                    console.info(chains.value)
                }
            });
        })
    });

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
            <select v-model="dest" class="select select-bordered capitalize dark:text-white" :disabled="destDisabled"
                @change="selectDest">
                <option value="">Select Destination</option>
                <option v-for="v in chains" :value="v">
                    {{ v.to }}
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
