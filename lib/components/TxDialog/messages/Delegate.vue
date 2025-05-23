<script lang="ts" setup>
import { ComputedRef, PropType, computed, onMounted, onUnmounted, ref } from 'vue';
import {
    getActiveValidators,
    getInactiveValidators,
    getStakingParam,
} from '../../../utils/http';
import { decimal2percent } from '../../../utils/format';
import { Coin, CoinMetadata } from '../../../utils/type';
import { TokenUnitConverter } from '../../../utils/TokenUnitConverter';

const props = defineProps({
    endpoint: { type: String, required: true },
    sender: { type: String, required: true },
    balances: Object as PropType<Coin[]>,
    metadata: Object as PropType<Record<string, CoinMetadata>>,
    params: String,
});
const params = computed(() => JSON.parse(props.params || '{}'));

const validator = ref('');

const activeValidators = ref([]);
const inactiveValidators = ref([]);
const stakingDenom = ref('ahp');
const unbondingTime = ref('');
const amount = ref('');
const amountDenom = ref('hp');

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
    return [
        {
            typeUrl: '/cosmos.staking.v1beta1.MsgDelegate',
            value: {
                delegatorAddress: props.sender,
                validatorAddress: validator.value,
                amount: convert.displayToBase(stakingDenom.value, {
                    amount: String(amount.value),
                    denom: amountDenom.value,
                }),
            },
        },
    ];
});

const list: ComputedRef<
    {
        operator_address: string;
        description: { moniker: string };
        commission: { commission_rates: { rate: string } };
        status: string;
    }[]
> = computed(() => {
    return [...activeValidators.value, ...inactiveValidators.value];
});

const available = computed(() => {
   
    const base = props.balances?.find(
        (x) => x.denom === stakingDenom.value
    ) || { amount: '0', denom: stakingDenom.value };
    return {
        base,
        display: convert.baseToUnit(base, amountDenom.value),
    };
});

function loadInactiveValidators() {
    getInactiveValidators(props.endpoint).then((x) => {
        inactiveValidators.value = x.validators;
    });
}

const units = computed(() => {
    return [{ denom: 'hp', exponent: 18, aliases: [] }];
});

const isValid = computed(() => {
    let ok = true;
    let error = '';
    if (!validator.value) {
        ok = false;
        error = 'Validator is empty';
    }
    if (!(Number(amount.value) > 0)) {
        ok = false;
        error = 'Amount should be great than 0';
    }
    if (!amountDenom.value) {
        ok = false;
        error = 'Amount Denom is empty';
    }
    return { ok, error };
});

function initial() {
    activeValidators.value = [];
    validator.value = params.value.validator_address;
    getStakingParam(props.endpoint).then((x) => {
        stakingDenom.value = x.params.bond_denom; // ahp
        unbondingTime.value = x.params.unbonding_time;
    });
    getActiveValidators(props.endpoint).then((x) => {
        activeValidators.value = x.validators;
        if (!params.value.validator_address) {
            validator.value = x.validators.find(
                (v) => v.description.identity === '6783E9F948541962'
            )?.operator_address;
        }
    });
}

onMounted(()=>{
    initial();
})

defineExpose({ msgs, isValid, initial });
</script>
<template>
    <div>
        <div class="form-control">
            <label class="label">
                <span class="label-text">Sender</span>
            </label>
            <input
                :value="sender"
                type="text"
                class="text-gray-600 dark:text-white input border !border-gray-300 dark:!border-gray-600"
            />
        </div>
        <div class="form-control">
            <label class="label">
                <span class="label-text">Validator</span>
                <a class="label-text" @click="loadInactiveValidators()"
                    >Show Inactive</a
                >
            </label>
            <select
                v-model="validator"
                class="select select-bordered dark:text-white"
            >
                <option value="">Select a validator</option>
                <option v-for="v in list" :value="v.operator_address">
                    {{ v.description.moniker }} ({{
                        decimal2percent(v.commission.commission_rates.rate)
                    }}%)
                    <span v-if="v.status !== 'BOND_STATUS_BONDED'">x</span>
                </option>
            </select>
        </div>
        <div class="form-control">
            <label class="label">
                <span class="label-text">Amount</span>
                <span>
                    {{ available?.display.amount }}
                    {{ available?.display.denom }}
                </span>
            </label>
            <label class="join">
                <input
                    v-model="amount"
                    type="number"
                    :placeholder="`Available: ${available?.display.amount}`"
                    class="input border border-gray-300 dark:border-gray-600 w-full join-item dark:text-white"
                />
                <select
                    v-model="amountDenom"
                    class="select select-bordered join-item dark:text-white"
                >
                    <option v-for="u in units">{{ u.denom }}</option>
                </select>
            </label>
        </div>
    </div>
</template>
