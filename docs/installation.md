# 开发环境安装清单

安装日期：2026-09-11。

| 项目 | 位置 | 处理 |
| --- | --- | --- |
| Node.js 22.14.0 | F:\Work Program Files\node-v22.14.0-x64 | 复用，不重装 |
| Git | F:\Work Program Files\Git | 复用，不重装 |
| Edge WebView2 152.0.4191.66 | C:\Program Files (x86)\Microsoft\EdgeWebView\Application | 复用，不重装 |
| Microsoft C++ Build Tools / MSVC 14.44.35207 | F:\BuildTools | 新装 C++ x64/x86 编译工具及 Windows 11 SDK 26100；安装器退出 0，真实 Rust 编译成功；此目录约 1671 MiB |
| Windows SDK / 微软共享组件 | 由微软安装器管理，部分位于 C:\Program Files (x86)\Windows Kits 等系统位置 | 构建工具必需的共享组件，不能全部放入项目 |
| Rust 1.98.1 / Cargo 1.98.1 / rustup | C:\Users\ZHP\.rustup、C:\Users\ZHP\.cargo | 已安装验证，仅 rustc、rust-std、cargo 三个组件；不修改 PATH；.rustup 约 599 MiB，.cargo 含依赖缓存约 430 MiB |
| Svelte、TypeScript、Vite、Tauri CLI/API | 项目 node_modules | 项目内安装，版本锁定在 package-lock.json；无 npm 全局安装 |
| Rust 依赖 / 构建缓存 | 用户 .cargo / 项目 src-tauri\target | 编译时下载和生成 |

官方来源：Rust static.rust-lang.org；微软 aka.ms/vs/17/release/vs_BuildTools.exe；npm 官方配置仓库。微软安装使用 --nocache、--norestart；未安装完整 Visual Studio IDE、额外编辑器、Python 或浏览器。

官方安装程序及 71 MB 编译器下载包已从项目 .tools 清理。Rust 下载缓存还保留约 23 MB 的 .partial 文件。保留 package-lock.json 和 Cargo.lock 以便复现依赖。Tauri 图标生成的 Android / iOS 目录已清理。

隔离验收数据在项目 .tools/native-data。早期测试还产生过 C:\Users\ZHP\AppData\Roaming\local.devpad.app（旧标识）的测试数据库与两张图片；自动审批因数据删除风险拒绝清理，该目录保留，不影响新版 local.devpad.desktop。未绕过审批删除数据库或附件。

卸载：微软组件用“已安装的应用”中的 Visual Studio Build Tools 卸载/修改；Rust 使用用户 .cargo\bin\rustup.exe self uninstall。项目 node_modules、dist、src-tauri\target 为可再生成内容。应用数据单独保存在 %APPDATA%\local.devpad.desktop，删除项目不会删除笔记。


0.4.0 新增项目依赖：tauri-plugin-single-instance 2.4.4；启用 Tauri 内置 tray-icon 功能；直接使用已缓存的 winreg 0.55。均位于现有 Cargo 缓存及项目构建目录，无新系统软件、服务或全局 npm 安装。开机自启由应用设置按需登记，默认不开启。
