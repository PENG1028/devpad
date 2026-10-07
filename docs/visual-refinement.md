# DevPad 视觉调整：极简笔记本

采用已确认方案 A：深灰底、白色笔记本、书脊与两条记录线。Logo 源文件为 src-tauri/icons/devpad.svg；桌面 ICO 和各尺寸 PNG 由 Tauri 图标工具生成。托盘使用 32px 资源，悬浮入口直接使用同一 SVG。浮点状态维持原有行为。

界面保留浅深主题、原生窗口控制和独立编辑窗口。新增笔记数量与轻量说明；正文、类型、标签、时间和状态分层；状态同时有文字与图形。底部输入入口增加快捷键提示。分栏、发送、外观图标统一线宽，键盘焦点清晰可见。小窗口收起辅助说明，保留主要操作。

实现：src/refinement.css 管理本轮视觉覆盖，src/Icon.svelte 管理操作图标。悬浮 Logo 由 Bubble.svelte 引用品牌源图。没有更改数据库结构。

验证：npm run check、npm test、Windows release 构建；tests/visual-refinement.cjs 使用模拟数据验证浅深主题、侧栏筛选、400×320 / 520×480 / 760×480 / 1440×900 的溢出和遮挡，以及保存、搜索、选择和交付提示词。运行界面测试前启动 npm run dev。截图为模拟记录。

交付文件：release/DevPad-0.6-UI.exe。保留原 0.6 EXE，先从托盘退出旧版再打开 UI 版，沿用现有本地数据目录。

原生验收：交付 EXE 已在独立 DEVPAD_DATA_DIR 启动，验证真实浅深主题、悬浮 Logo 资源加载与点击展开。测试进程已退出。
