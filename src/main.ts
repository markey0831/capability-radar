import './style.css'
import { createApp } from './app'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('应用挂载节点不存在')
createApp(root)
