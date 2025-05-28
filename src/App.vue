<script setup lang="ts">
import { onMounted, ref } from 'vue';
import pingWidget from '../lib/main';
import { DEFAULT_HDPATH } from '../lib/wallet/Wallet';

interface Config {
    endpoint: string;
    chainId: string;
    chainName: string;
    params: string;
}

const HIPPO: Config = {
    endpoint: 'https://api.testnet.hippo-protocol.com',
    chainId: 'hippo-protocol-testnet-1',
    params: JSON.stringify({}), //change when needed(vote, ...)
    chainName: 'hippo-protocol',
};

const sender = ref('') //Connected wallet address
const hdPath = ref(DEFAULT_HDPATH) //Default HD path

const conf = ref(HIPPO);

const types = [
    'send',
    'multisend',
    'propose',
    'delegate',
    'vote',
    'redelegate',
    'unbond',
    'transfer',
    'deposit',
    'withdraw',
    'withdraw_commission',
    'wasm_instantiate_contract',
    'wasm_execute_contract',
    'wasm_store_code',
    'wasm_migrate_contract',
    'wasm_update_admin',
    'wasm_clear_admin',
];
const toOpen = ref('send');

const theme = ref('light');
const switchTheme = () => {
    if (theme.value === 'light') {
        theme.value = 'dark';
        document.documentElement.classList.add('dark');
    } else {
        theme.value = 'light';
        document.documentElement.classList.remove('dark');
    }
    document.documentElement.setAttribute('data-theme', theme.value);
};

onMounted(() => {
    document.documentElement.classList.add('light');
    document.documentElement.setAttribute('data-theme', 'light');
});

const onConnect = (wallet: any) => {
    sender.value = wallet.detail.value.cosmosAddress;
    hdPath.value = wallet.detail.value.hdPath;
};

</script>

<template>
    <div class="bg-gray-50 dark:bg-base-100 dark:text-white min-h-[100vh]">
        Ping Widget Version: {{ pingWidget?.version }}

        <div class="btn btn-sm normal-case" @click="switchTheme()">
            Theme: {{ theme }}
        </div>

        <div>&nbsp;</div>
        <ping-connect-wallet :chain-id="conf.chainId" :hd-path="hdPath" @connect="onConnect" />

        <textarea v-model="conf.params" cols="80" rows="5"></textarea>
        <div></div>

        <select v-model="toOpen">
            <option v-for="i in types">{{ i }}</option>
        </select>

        <br />

        <label :for="toOpen" class="btn">{{ toOpen }}</label>
        <ping-tx-dialog :type="toOpen" :sender="sender" :registry-name="conf.chainName" :endpoint="conf.endpoint"
            :hd-path="hdPath" :params="conf.params"></ping-tx-dialog>

        <br />
    </div>
</template>

<style scoped></style>
