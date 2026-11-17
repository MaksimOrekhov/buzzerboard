<script setup lang="ts">
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from 'reka-ui'
import { watch } from 'vue'
import AppIcon from './AppIcon.vue'
defineProps<{ title: string; description: string }>()
const open = defineModel<boolean>('open', { required: true })
let opener: HTMLElement | null = null
watch(
  open,
  (value) => {
    if (value)
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  },
  { flush: 'sync' },
)
function restoreFocus(event: Event) {
  event.preventDefault()
  if (opener?.isConnected) opener.focus()
}
</script>
<template>
  <DialogRoot v-model:open="open"
    ><DialogPortal
      ><DialogOverlay class="ui-dialog-overlay" /><DialogContent
        class="game-center-theme ui-dialog"
        @close-auto-focus="restoreFocus"
        ><header class="ui-dialog-header">
          <div>
            <DialogTitle class="ui-dialog-title">{{ title }}</DialogTitle><DialogDescription
              class="ui-dialog-description"
              >{{ description }}</DialogDescription
            >
          </div>
          <DialogClose class="gc-icon-button" aria-label="Закрыть окно"
            ><AppIcon name="close"
          /></DialogClose>
        </header>
        <slot /></DialogContent></DialogPortal
  ></DialogRoot>
</template>
