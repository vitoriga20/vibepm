# NOTICE

本产品（vibepm desktop 桌面壳）的"灵动岛"组件复用了 **NetSpeed Dynamic Pro** 的代码。

- 项目：NetSpeed Dynamic Pro（NSD）
- 作者：© 2026 GEORGEWU
- 协议：MIT License（完整文本见 `src-island/LICENSE`）
- 复用范围：岛前端 Vue 工程（`src-island/`，WidgetIsland 岛本体）与岛能力 Rust 模块
  （`src-tauri/src/island.rs`、`music_controller.rs`、`audio_spectrum.rs`、
  `system_events.rs`、`notification.rs`，源自 NSD src-tauri/src/lib.rs 及同名模块）。
- 修改说明：按 vibepm 桌面端需求做了接入改造（双击/右键开主窗、设置事件下发、
  右缘吸附、剔除任务栏挂件/FPS 插件/NSD 托盘），核心逻辑保持原样。
