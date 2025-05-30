<script lang="ts" setup>
import { PropType, computed, onMounted, ref } from 'vue';
import { Coin, CoinMetadata } from '../../../utils/type';
import { TokenUnitConverter } from '../../../utils/TokenUnitConverter';
import { MsgSubmitProposal, MsgUpdateParams } from 'cosmjs-types/cosmos/gov/v1/tx';
import { getGovParams } from '../../../utils/http';

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

const params = ref({})

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
                // Currently gov module's MsgUpdateParams is applied
                // below do not reflect new parameters in cosmos-sdk v0.50 (marked as comment below).
                // so I'm not sure after proposal pass, it works or not.
                typeUrl: MsgUpdateParams.typeUrl,
                value: MsgUpdateParams.encode({
                    authority: "hippo10d07y265gmmuvt4z0w9aw880jnsr700jt297gg",
                    params: {
                        minDeposit: [
                            {
                                "denom": "ahp",
                                "amount": "50000000000000000000000"
                            }
                        ],
                        maxDepositPeriod: { seconds: BigInt(1209600), nanos: 0 },
                        votingPeriod: { seconds: BigInt(86400), nanos: 0 },
                        quorum: "0.334000000000000000",
                        threshold: "0.500000000000000000",
                        vetoThreshold: "0.334000000000000000",
                        minInitialDepositRatio: "0.000000000000000000",
                        // "proposal_cancel_ratio": "0.500000000000000000",
                        // "proposal_cancel_dest": "",
                        // "expedited_voting_period": "3600s",
                        // "expedited_threshold": "0.667000000000000000",
                        // "expedited_min_deposit": [
                        //     {
                        //         "denom": "ahp",
                        //         "amount": "100000000000000000000000"
                        //     }
                        // ],
                        burnVoteQuorum: false,
                        burnProposalDepositPrevote: false,
                        burnVoteVeto: true,
                        // "min_deposit_ratio": "0.010000000000000000"
                    },
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

    if (!(Number(deposit.value) > 0)) {
        ok = false
        error = "Initial deposit should be great than 0"
    }
    return { ok, error }
})

function initial() {
    denom.value = 'ahp'
}

onMounted(() => {
    getGovParams(props.endpoint).then(res => {
        console.info("Gov Params", res.params)
        Object.values(res.params).map(v => console.info(v, typeof v === 'string' && v.includes('s')))
        // TODO pick params and convert to camelCase
    }).catch(err => {
        console.error("Failed to get gov params", err)
    })
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
    </div>
</template>