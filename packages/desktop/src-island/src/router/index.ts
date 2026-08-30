import { createRouter, createWebHistory } from 'vue-router'
import WidgetIsland from '../views/WidgetIsland.vue'

// M2 S8：控制台窗(panel/MainPanel)已退役，功能集成进 vibepm 主窗（plugin-island-settings）。
// 岛是唯一前端路由页。
const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', redirect: '/widget' },
        { path: '/widget', component: WidgetIsland }
    ]
})

export default router
