# DevPad 在 iPhone 与 Mac 上的开发交接

桌面版已经有 SQLite 笔记库、原图附件、可恢复的草稿、项目与类型、图文导出和 20 种界面语言。iPhone 建议继续用 Tauri 2、Rust 和 Svelte，单独做触屏界面，用 Swift 接系统分享和照片选择。首个里程碑是让一条从其他 App 收进来的图文，在离线重启后还能找回并完整交出去。下文的 iPhone 部分是开发方案。

## iPhone 上的一条记录

在 Safari 看到一篇资料，点系统分享里的 DevPad，补一句想法，直接存进收件箱。在「照片」选两张样片走同一入口，确认页按所选顺序展示缩略图。打开 DevPad 后按日期找回，按项目或标签筛选，也能从文件名搜索图片。新建默认类型为「笔记」，类型和跨项目标签留到整理时再填。首轮以单机离线使用为范围，跨设备同步留待明确冲突处理、附件传输和恢复方式后单独开发。

首页用时间线，顶部提供搜索和项目范围，底部是单手能点到的「记一条」。详情和设置逐层返回并保留列表位置，筛选和选项目使用底部面板。编辑页随键盘调整，切后台前补存草稿。系统字号、VoiceOver、从右到左布局和减少动态效果一起验收。桌面端的托盘、悬浮窗和常驻 MCP 继续由桌面承载。

## 哪些能共用，哪些要先拆

| 仓库里已有的东西 | iOS 的做法 |
| --- | --- |
| SQLite 的记录、修订检查和草稿，以及 [输出顺序和文件清单](../src/core.ts) | 让桌面和手机调用同一套读写服务，保留记录与附件 ID。草稿使用编辑会话 ID，桌面窗口名只在桌面入口转换。 |
| [Rust 启动入口](../src-tauri/src/main.rs) 将数据库初始化和托盘、自动更新、桌面窗口、命令行 MCP 连在一起 | 拆出共享库和移动入口。桌面依赖、权限和启动逻辑按平台编译。手机使用单窗口和独立的应用标识。Tauri 支持把原生 iOS 接口封装为 Swift 插件。[Tauri 项目结构](https://v2.tauri.app/start/project-structure/) · [移动插件](https://v2.tauri.app/develop/plugins/develop-mobile/) |
| [前端入口](../src/main.ts) 打开桌面笔记本，[类型](../src/note-types.json) 和 [语言清单](../src/locales/registry.json) 已独立 | 增加手机入口，共用内容规则和翻译。分享扩展自己的按钮与提示也要逐种语言检查。 |
| 目前附件保存本机绝对路径，图片校验接受 PNG、JPEG 和 WebP | 新记录保存附件 ID 和相对路径，读取时在当前容器内解析。桌面旧路径兼容读。保留照片选择器实际提供的文件和格式。收到 HEIC 时保留源文件并单独生成可显示的预览，导出清单记录两者关系。只请求用户选中的照片。[Apple 照片选择器](https://developer.apple.com/documentation/photosui) |

## 分享入口的数据怎么走

1. Xcode 增加 Swift Share Extension。主 App 和扩展加入同一个 App Group。扩展接收文字、网址和图片，先把系统提供的临时文件复制到共享目录，每次分享分配一个 ID，清单记录正文、附件 ID、原名和顺序。所有文件写好后才把整批标为可导入，再向用户显示已保存。取消或拷贝失败时不显示成功。[Apple 分享扩展](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/Share.html) · [App Groups](https://developer.apple.com/documentation/xcode/configuring-app-groups) · [临时文件接口](https://developer.apple.com/documentation/foundation/nsitemprovider/loadfilerepresentation%28fortypeidentifier%3Acompletionhandler%3A%29)
2. 主 App 打开或回到前台时导入。先按附件 ID 放好文件，再在一个 SQLite 事务里写记录和唯一的分享 ID。事务提交后清理共享目录。中途被系统回收可以重试，同一批只出现一条记录。主 App 关闭时扩展也能保存，用户无需跳转。
3. 发给其他 App 时用系统分享面板。接收方决定怎样排列多个对象。需要保证正文与每张原图能配对时，另提供一份包含 Markdown、图片和清单的压缩包，共用桌面已有的顺序和重名处理。[Apple 系统分享面板](https://developer.apple.com/documentation/uikit/uiactivityviewcontroller)

## 开发与验收顺序

| 阶段 | 可以验收的结果 |
| --- | --- |
| 第一份改动 | 拆开桌面启动与数据服务，跑原有桌面回归。在 Mac 的完整 Xcode 环境执行一次 `npm run tauri -- ios init`，用 `npm run tauri -- ios dev` 打开模拟器。写一条笔记，退出重开后能读到。把移动工程、扩展和权限纳入版本管理。[Tauri 开发环境](https://v2.tauri.app/start/prerequisites/#ios) · [移动端运行](https://v2.tauri.app/develop/#developing-your-mobile-application) |
| 第一份真机样品 | 主 App 关闭，从 Safari 存链接，从照片存两张同名图片，分别验证备注、图片顺序和文件内容。再测取消、导入中断、重复打开、离线、HEIC、键盘及锁屏恢复草稿。更换测试数据根目录后，笔记仍能找到原图。 |
| 第一轮内测 | 补齐时间线、搜索、项目范围、触屏整理和对外分享。核对 20 种语言，真机走一遍大字号、VoiceOver、阿拉伯语和减少动态效果。主 App 与扩展签名后通过 TestFlight 分发。[Apple TestFlight](https://developer.apple.com/testflight/) |

## macOS 的标题栏与缩放

这轮把主窗和独立窗的标题栏交回 AppKit。系统负责摆放红黄绿按钮，项目、搜索等操作在同一行给它们留出空间，位置跟随系统标题栏方向。进入全屏由系统管理窗口。收成悬浮笔记本时暂时收起标题栏，展开时恢复原生按钮。Mac 的 Dock 与 Windows 任务栏分别处理，系统「减少动态效果」沿用现有的缩放开关。[Tauri 窗口外观](https://v2.tauri.app/learn/window-customization/) · [Apple 窗口设计](https://developer.apple.com/design/human-interface-guidelines/windows)

Mac 实机验收要覆盖红黄绿按钮、普通窗口和全屏之间切换、Retina 与外接屏之间拖动、收起展开后的原位置、草稿与选择、减少动态效果。两种架构的桌面打包和数据测试可以在 CI 完成，窗口手感及系统动画需要实际 Mac 验收。
