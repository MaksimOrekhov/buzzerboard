<script setup lang="ts">
import { shallowRef } from 'vue'

const failed = shallowRef(false)
const logoUrl = 'https://cdn.nba.com/logos/nba/nba-logoman.svg'
</script>

<template>
  <span class="gc-league-symbol" aria-label="NBA">
    <img
      v-if="!failed"
      :src="logoUrl"
      alt=""
      width="30"
      height="37"
      decoding="async"
      referrerpolicy="no-referrer"
      @error="failed = true"
    />
    <span v-else>NBA</span>
  </span>
</template>
