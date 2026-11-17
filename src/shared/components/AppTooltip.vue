<script setup lang="ts">
import { TooltipRoot, TooltipTrigger, TooltipPortal, TooltipContent } from 'reka-ui'
defineProps<{ text: string }>()
</script>
<template>
  <TooltipRoot :delay-duration="250"
    ><TooltipTrigger as-child><slot /></TooltipTrigger
    ><TooltipPortal
      ><TooltipContent
        class="game-center-theme ui-tooltip"
        :side-offset="8"
        :collision-padding="12"
        >{{ text }}</TooltipContent
      ></TooltipPortal
    ></TooltipRoot
  >
</template>
