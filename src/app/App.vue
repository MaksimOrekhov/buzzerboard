<script setup lang="ts">
import { useRoute } from 'vue-router'
import AppShell from './AppShell.vue'
import GameCenterShell from './GameCenterShell.vue'
const route = useRoute()
</script>
<template><GameCenterShell v-if="route.name === 'games'" /><AppShell v-else /></template>
