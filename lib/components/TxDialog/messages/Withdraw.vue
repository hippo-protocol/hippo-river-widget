<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { getDelegateRewards } from '../../../utils/http'

const props = defineProps({
    endpoint: { type: String, required: true },
    sender: { type: String, required: true },
    params: String,
});

const rewards = ref([] as { reward: { amount: string, denom: string }, validator_address: string }[])
const selectedValidators = ref<string[]>([])

const msgs = computed(() => {
    return selectedValidators.value.map(v => {
        return {
            typeUrl: '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward',
            value: {
                delegatorAddress: props.sender,
                validatorAddress: v,
            },
        }
    })
})

const isValid = computed(() => {
    let ok = true
    let error = ""
    if (!props.sender) {
        ok = false
        error = "Sender is empty"
    } else if (rewards.value.length === 0) {
        ok = false
        error = "No delegation found"
    } else if (selectedValidators.value.length === 0) {
        ok = false
        error = "No validator selected"
    }
    return { ok, error }
})

function initial() {
    getDelegateRewards(props.endpoint, props.sender).then(x => {
        rewards.value = x.rewards || []
        selectedValidators.value = rewards.value.map((r: any) => r.validator_address)
    })
}

onMounted(() => {
    initial()
})

defineExpose({ msgs, isValid, initial })
</script>
<template>
    <div class="flex flex-col gap-4">
        <div class="form-control">
            <label class="label">
                <span class="label-text">Sender</span>
            </label>
            <input :value="sender" type="text" readonly class="text-gray-600 dark:text-white input border !border-gray-300 dark:!border-gray-600 bg-gray-100 dark:bg-gray-800" />
        </div>
        <div class="form-control" v-if="rewards.length > 0">
            <label class="label">
                <span class="label-text">Select Validators</span>
            </label>
            <div class="max-h-60 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded p-2 flex flex-col gap-2">
                <label v-for="r in rewards" :key="r.validator_address" class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" :value="r.validator_address" v-model="selectedValidators" class="checkbox checkbox-sm" />
                    <span class="text-sm text-gray-700 dark:text-gray-300 break-all">{{ r.validator_address }}</span>
                </label>
            </div>
        </div>
    </div>
</template>