import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import './design-system/tokens.css'
import './design-system/global.css'

createApp(App).use(createPinia()).use(router).mount('#app')
