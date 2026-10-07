本文件保留初版数据与技术设计。当前界面与窗口结构以 [ui-redesign.md](ui-redesign.md) 为准。

# DevPad · MVP 设计

产品模型：Project 是上下文边界；Entry 是统一的文字、类型、标签、状态和图片记录。Prompt Draft 是可排序引用 Entry 的特殊记录。没有账户、网络服务或 AI API。

数据：SQLite 的 projects(id,name) 和 entries(id,project_id,payload)。payload 保存 id、projectId、type、text、createdAt、updatedAt、tags、attachments、status、references。附件元数据含 id/name/path；文件在应用数据目录 attachments 内。数据库事务保存记录，图片不进入数据库。删除记录暂保留文件，避免破坏已导出的上下文。

交互：左侧项目和类型多选；中央最新优先的时间流，顶部固定轻量编辑器；右侧按需打开 Agent 输出。Ctrl+Enter 保存，Ctrl+N 聚焦新增；Alt+1…6 切换类型；Enter 保持自然换行。复选框多选，Shift 连选，Ctrl 点击切换，Ctrl+A 在非输入区全选筛选结果。保存失败保留编辑内容。标签通过 #文本提取并可补全。

窗口：一个原生 Windows 主窗口，最小 900×640，初始 1280×820。全局快捷输入窗口后续扩展，不妨碍本版应用内快速输入。图片大图使用可 Escape 关闭的模态预览。

技术：Tauri 2 / Svelte 5 / TypeScript / Rust / rusqlite（bundled）。复用系统 WebView2，不捆绑浏览器。系统字体，无在线字体、遥测或外部 API。浅灰侧栏、白色阅读区、靛蓝选中态，线分隔而非多层卡片。

剪贴板研究：Windows 可同时发布多种格式，但接收方自行选择，不保证将文本与多个文件合并。CF_UNICODETEXT 适合提示词，CF_HDROP 适合文件列表；Bitmap 通常是一张图；HTML/RTF 可表达图文，但目标 Agent 可能丢弃图片或忽略富文本。MVP 使用可靠的 Copy Text，并提供 Copy Images 文件列表和 Export Bundle（prompt.md + 有序重命名图片）。不声称已验证 ChatGPT / Claude / Cursor / Codex 全部目标的混合粘贴。

参考：https://learn.microsoft.com/en-us/windows/win32/dataxchg/clipboard-formats
https://learn.microsoft.com/en-us/windows/win32/shell/clipboard
https://tauri.app/start/prerequisites/

