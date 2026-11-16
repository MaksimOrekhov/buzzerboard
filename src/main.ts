import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

import { VueQueryPlugin } from '@tanstack/vue-query'
import { createApp } from 'vue'

import App from './app/App.vue'
import { queryClient } from './app/query-client'
import { router } from './app/router'
import './assets/main.css'

createApp(App).use(router).use(VueQueryPlugin, { queryClient }).mount('#app')
