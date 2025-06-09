<script lang="ts" setup>

import { computed, onMounted, PropType, ref } from 'vue';
import { Coin, CoinMetadata } from '../../../utils/type';
import { TokenUnitConverter } from '../../../utils/TokenUnitConverter';

import { MsgSubmitProposal } from 'cosmjs-types/cosmos/gov/v1/tx';
import { MsgCommunityPoolSpend } from 'cosmjs-types/cosmos/distribution/v1beta1/tx';
import { getAuthority, getCommunityPool } from '../../../utils/http';

const props = defineProps({
    endpoint: { type: String, required: true },
    sender: { type: String, required: true },
    balances: Object as PropType<Coin[]>,
    metadata: Object as PropType<Record<string, CoinMetadata>>,
    params: String,
});

const denom = ref("")
const deposit = ref("")
const amountDenom = ref("hp")
const title = ref("")
const summary = ref("")
const authority = ref("")
const recipient = ref("")
const amount = ref("")
const communityPoolAvailable = ref(
    { amount: "0", denom: "ahp" }
)

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
const available = computed(() => {
    const base = props.balances?.find(x => x.denom === denom.value) || { amount: "0", denom: denom.value }
    return {
        base,
        display: convert.baseToUnit(base, amountDenom.value)
    }
})

const msgs = computed(() => {
    return [{
        typeUrl: MsgSubmitProposal.typeUrl, value: MsgSubmitProposal.fromPartial({
            messages: [{
                typeUrl: MsgCommunityPoolSpend.typeUrl,
                value: MsgCommunityPoolSpend.encode({
                    authority: authority.value,
                    recipient: recipient.value,
                    amount: [convert.displayToBase(denom.value, {
                        amount: String(amount.value),
                        denom: amountDenom.value
                    })]
                }).finish(),
            }],
            initialDeposit: [convert.displayToBase(denom.value, {
                amount: String(deposit.value),
                denom: amountDenom.value
            })],
            proposer: props.sender,
            title: title.value,
            summary: summary.value,
        })
    }]
})


const units = computed(() => {
    return [{ denom: 'hp', exponent: 18, aliases: [] }];
})

const isValid = computed(() => {
    let ok = true
    let error = ""

    if (!authority.value) {
        ok = false
        error = "failed to fetch Authority"
    }
    if (!recipient.value) {
        ok = false
        error = "Recipient is required"
    }
    if (!(Number(deposit.value) > 0)) {
        ok = false
        error = "Initial deposit should be great than 0"
    }
    if (!(Number(amount.value) > 0)) {
        ok = false
        error = "Spend amount should be great than 0"
    }
    return { ok, error }
})

function initial() {
    denom.value = 'ahp'
}

onMounted(() => {
    getAuthority(props.endpoint).then((res) => {
        authority.value = res.address;
    }).catch((err) => {
        console.error("Failed to fetch authority:", err);
    });

    getCommunityPool(props.endpoint).then((res) => {
        if (!res.pool[0]) throw new Error("Failed to fetch community pool");
        const communityPoolBalance = res.pool[0];
        communityPoolAvailable.value = convert.baseToDisplay({ amount: communityPoolBalance.amount, denom: communityPoolBalance.denom });
    }).catch((err) => {
        console.error("Failed to fetch community pool:", err);
    });
})

defineExpose({ msgs, isValid, initial })

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
                <span class="label-text">Title</span>
                <input v-model="title" type="text"
                    class="text-gray-600 dark:text-white input border !border-gray-300 dark:!border-gray-600" />
            </label>
        </div>
        <div class="form-control">
            <label class="label">
                <span class="label-text">Summary</span>
                <input v-model="summary" type="text"
                    class="text-gray-600 dark:text-white input border !border-gray-300 dark:!border-gray-600" />
            </label>
        </div>
        <div class="form-control">
            <label class="label">
                <span class="label-text">Initial Deposit</span>
                <span>{{ available?.display.amount }}{{ available?.display.denom }}</span>
            </label>
            <label class="input-group">
                <input v-model="deposit" type="number" :placeholder="`Available: ${available?.display.amount}`"
                    class="input border border-gray-300 dark:border-gray-600 w-full dark:text-white" />
                <select v-model="amountDenom" class="select select-bordered dark:text-white">
                    <option v-for="u in units">{{ u.denom }}</option>
                </select>
            </label>
        </div>
        <div class="form-control">
            <label class="label">
                <span class="label-text">Recipient</span>
            </label>
            <input v-model="recipient" type="text"
                class="text-gray-600 dark:text-white input border !border-gray-300 dark:!border-gray-600" />
        </div>
        <div class="form-control">
            <label class="label">
                <span class="label-text">Amount</span>
                <span>{{ communityPoolAvailable.amount }}{{ communityPoolAvailable.denom }}</span>
            </label>
            <label class="input-group">
                <input v-model="amount" type="number" :placeholder="`Available: ${communityPoolAvailable.amount}`"
                    class="input border border-gray-300 dark:border-gray-600 w-full dark:text-white" />
                <select v-model="amountDenom" class="select select-bordered dark:text-white">
                    <option v-for="u in units">{{ u.denom }}</option>
                </select>
            </label>
        </div>
    </div>
</template>