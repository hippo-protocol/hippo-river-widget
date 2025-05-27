<script lang="ts" setup>
import { PropType, computed, ref } from 'vue';
import { Coin, CoinMetadata } from '../../../utils/type';
import { TokenUnitConverter } from '../../../utils/TokenUnitConverter';
import { MsgMultiSend } from 'cosmjs-types/cosmos/bank/v1beta1/tx';
import BigNumber from 'bignumber.js';
const props = defineProps({
    endpoint: { type: String, required: true },
    sender: { type: String, required: true },
    balances: Object as PropType<Coin[]>,
    metadata: Object as PropType<Record<string, CoinMetadata>>,
    params: String,
});

const amount = ref(['']);
const recipient = ref(['']);
const denom = ref('');
const amountDenom = ref('hp')
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
    const sum = amount.value.reduce((acc, cur) => {
        return acc.plus(BigNumber(cur))
    }, BigNumber(0)).toString();

    return [
        {
            typeUrl: MsgMultiSend.typeUrl,
            value: {
                inputs: [{
                    "address": props.sender, "coins": [
                        convert.displayToBase(denom.value, {
                            amount: sum,
                            denom: amountDenom.value
                        })]
                }],
                outputs: recipient.value.map((r, i) => ({
                    "address": r,
                    "coins": [
                        convert.displayToBase(denom.value, {
                            amount: amount.value[i],
                            denom: amountDenom.value
                        })]
                })),
            },
        },
    ];
});

const available = computed(() => {
    const base = (
        props.balances?.find((x) => x.denom === denom.value) || {
            amount: '0',
            denom: '-',
        }
    )
    return {
        base,
        display: convert.baseToUnit(base, amountDenom.value)
    };
});

const showBalances = computed(() => {
    return props.balances?.map(b => ({
        base: b,
        display: convert.baseToDisplay(b)
    })) || []
})

const units = computed(() => {
    return [{ denom: 'hp', exponent: 18, aliases: [] }];
})

const isValid = computed(() => {
    let ok = true
    let error = ""
    if (recipient.value.length !== amount.value.length) {
        ok = false
        error = "Unknown Error occurred"
    }
    if (recipient.value.some((r, i) => (!r && !!amount.value[i]) || (!!r && !amount.value[i]))) {
        // when recipient is empty, amount should be empty and vice versa
        ok = false
        error = "You should fill both recipient and amount"
    }
    return { ok, error }
})

function initial() {
    denom.value = 'ahp'
    amount.value = ['']
    recipient.value = ['']
}

function formatDenom(v: any) {
    return String(v).substring(0, 10)
}

const addRecipient = () => {
    recipient.value.push('')
    amount.value.push('')
}

defineExpose({ msgs, isValid, initial })
</script>
<template>
    <div class="dark:text-gray-400">
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
            <select v-model="denom" class="select select-bordered dark:text-white">
                <option value="">Select a token</option>
                <option v-for="{ base, display } in showBalances" :value="base.denom">
                    {{ display.amount }} {{ display.denom }}
                </option>
            </select>
        </div>
        <div v-for="(r, i) in recipient" :key="i" class="border-b border-black pb-4">
            <div class="form-control">
                <label class="label">
                    <span class="label-text">Recipient{{ i + 1 }}</span>
                </label>
                <input v-model="recipient[i]" type="text"
                    class="input border border-gray-300 dark:border-gray-600 dark:text-white" />
            </div>
            <div class="form-control">
                <label class="label">
                    <span class="label-text">Amount for Recipient{{ i + 1 }}</span>
                </label>
                <label class="input-group">
                    <input v-model="amount[i]" type="number" :placeholder="`Available: ${available?.display.amount}`"
                        class="input border border-gray-300 dark:border-gray-600 w-full dark:text-white" />
                    <select v-model="amountDenom" class="select select-bordered dark:text-white">
                        <option v-for="u in units" :value="u.denom">{{ formatDenom(u.denom) }}</option>
                    </select>
                </label>
            </div>
        </div>
        <label class="form-control mt-4">
            <button @click="addRecipient" class="bg-gray-200">Add Recipient</button></label>

    </div>
</template>
