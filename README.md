# DevPad

本地轻量图文工作日志。随手记录文字和截图，按日期回看，需要时复制、导出或交给 Agent。

使用 Tauri 2、Rust、Svelte 5、TypeScript 和 SQLite。Windows 使用系统 WebView2，macOS 使用 WKWebView，Linux 使用 WebKitGTK；不附带 Electron 或 Node 运行时。全部笔记、附件、草稿与任务保存在本机。

## 安装与更新

从 [Releases](https://github.com/PENG1028/devpad/releases) 下载对应平台的安装包。日常测试使用 `develop` 开发版；稳定发布来自 `main` 上的 `vX.Y.Z` 标签。

- Windows：运行 `windows-x86_64-setup.exe`，按当前用户安装。首次从旧的 `DevPad-版本号.exe` 迁移时，先退出旧程序。安装器会备份并迁移桌面、开始菜单、自启动目录及任务栏固定目录内指向旧版本的快捷方式。后续沿用固定的安装路径和 `devpad.exe`。
- macOS：选择 Apple Silicon 或 Intel 的 DMG，将 DevPad.app 放在固定位置（建议 Applications）。应用更新替换原位置的应用包，Dock 入口沿用该位置。当前未配置 Apple 开发者签名和公证，首次打开需遵循系统对未签名应用的设置。
- Linux：AppImage 可在应用内更新，需保留执行权限和固定位置。deb 的后续安装由系统包管理器处理。Linux 桌面环境对托盘的支持不同。

打开「更多 → 关于 → 版本与更新」，点击「检查并更新」，完成下载、签名验证、草稿保存、数据库备份和安装。设置中可以切换开发版/稳定版通道。检查或下载失败保留当前应用和数据；尚未发布稳定包时，稳定通道无法更新。

更新签名与 Windows 代码签名、Apple 签名是不同机制。当前已启用更新包签名，尚未配置平台代码签名证书。更新前结束正在使用旧程序的 MCP 会话，更新后重连客户端。

## 记录、复制与导出

首页按日期呈现全部记录，可以按项目筛选。点「记一条」在主窗底部编辑。支持粘贴文字和截图、拖入图片、搜索正文/项目/标签、移动项目和图片标注。项目、标签和记录类型在编辑区的「整理」中调整。

点左上角项目名打开项目列表。宽窗可以一边切换项目一边回看或编辑记录。窄窗保留同一份列表，选好后点「查看记录」或按 Esc 收起。方向键可以浏览项目，Enter 切换。已有草稿保留原项目，保存后下一条跟随当前项目。

- 快捷按钮复制正文，纯图片记录可以直接复制图片。多选按列表顺序复制，在「更多」中可复制或导出所选图文。普通输出使用原文和原图，沿用所见顺序。
- 打开单条或批量菜单的「导出…」，默认以「原文与原图」保存 `记录.md`、原图和对应清单。剪贴板粘贴效果取决于接收软件，完整图文可通过导出文件交接。
- 在同一窗口切换到「使用模板」即可预览并选择模板。预置原文、图文资料、讨论分析和工程任务。自定义模板和默认模板可在设置中管理。类型/状态/标签、引用展开和图内编号均为可选项。
- 模板变量为 `{{content}}`、`{{image_map}}`、`{{project}}`、`{{batch}}`。未知变量在保存时提示错误，不执行脚本。
- 高级导出包含 `prompt.md`、图片及 `manifest.json`。只有开启图片编号时才生成带编号的 PNG。

主窗输入会自动保留为本地草稿，收起或重新启动后可通过「继续写草稿」接着写。点击保存或 Ctrl/⌘+Enter 后才进入时间线，可以继续写下一条。独立窗口的草稿通过「恢复草稿」打开。多个窗口或 Agent 同时修改同一记录时，旧版本提交会被拒绝，当前输入保留供合并。

Windows 用 Ctrl、macOS 用 ⌘。N 打开输入，F 搜索，Enter 保存，输入框外 A 全选当前结果，Shift+点击连续选择。主窗口关闭默认进入托盘，可以从设置或托盘退出。在「更多」的「通用」中可调整主题、语言和主窗口置顶，「工具」中管理导出模板，「关于」中查看帮助与版本更新。

## 界面语言

「更多 → 通用 → 界面语言」支持跟随系统，也可固定选择 20 种语言。正文、项目名和自定义模板保留用户输入。界面会同步到已打开的窗口，托盘和下次启动沿用同一偏好。[设置布局与语言维护规范](docs/interface.md)

## MCP

「更多 → 工具 → Agent 与 MCP」提供当前安装位置的配置。将它加入支持 stdio MCP 的客户端即可使用，不需要另装运行时。例如：

```json
{
  "mcpServers": {
    "devpad": {
      "command": "你的固定安装路径/devpad.exe",
      "args": ["--mcp"]
    }
  }
}
```

macOS 命令位于 `DevPad.app/Contents/MacOS/devpad`。Linux 可以指向 `/usr/bin/devpad`（deb 安装）或固定位置的 AppImage；应用内配置会使用 AppImage 本身的路径，避免引用临时挂载目录。

MCP 模式不启动图形窗口，可以单独运行。协议支持 2024-11-05、2025-03-26、2025-06-18、2025-11-25 的初始化与 stdio 工具调用，不暴露网络端口。提供：

| 工具 | 用途 |
| --- | --- |
| `list_projects`, `list_note_types`, `list_notes`, `get_note` | 查询项目、内置和自定义类型、分页笔记 |
| `create_note`, `update_note` | 创建普通笔记，按 revision 修改正文 |
| `list_tasks`, `get_task` | 查询明确发布的任务和结果 |
| `claim_task`, `renew_task`, `release_task` | 原子领取、续期和释放 |
| `complete_task` | 使用领取凭证写回完成与验证说明 |
| `get_attachment` | 按笔记或任务内附件 ID 读取完整原图 |

普通笔记不会自动成为任务；从单条菜单或多选栏点击“发布任务”，可填写独立说明。任务使用不可变内容快照。租期默认 15 分钟，可设 60–3600 秒。其他 Agent 无法同时领取，租期到期后可重新领取，过期凭证无法覆盖新结果。撤回任务也会使当前凭证失效。完成结果和源笔记相互独立。

配置 MCP 客户端即授予它访问本机全部笔记的能力；客户端自身负责工具审批。私有草稿不通过 MCP 暴露，Agent 只能领取已经发布的任务。附件读取不接受任意文件路径。桌面应用会检测其他进程的数据库变动并刷新。

## 数据与兼容性

应用标识始终为 `local.devpad.desktop`，开发版与稳定版共用数据目录和安装位置，通道是用户设置。默认目录：

| 平台 | 数据位置 |
| --- | --- |
| Windows | `%APPDATA%\local.devpad.desktop` |
| macOS | `~/Library/Application Support/local.devpad.desktop` |
| Linux | `$XDG_DATA_HOME/local.devpad.desktop`，默认 `~/.local/share/local.devpad.desktop` |

`devpad.sqlite` 使用 WAL；`attachments` 保存原图，`exports` 保存图文复制的临时包。数据库中还保存草稿、任务和领取事件。删除笔记不会立即删除图片，以便恢复快照或备份。更新前的 SQLite 备份位于 `backups`，首次旧数据迁移也会先备份。恢复备份时须同时保留附件目录。

可用 `DEVPAD_DATA_DIR` 指定独立目录；MCP 和桌面应用必须指向同一目录。备份整个目录前应退出图形应用及 MCP 客户端。笔记数据不上传 GitHub，GitHub 只承载源码、安装包和更新索引。

## 开发与发布

安装 Node 22+、Rust stable 及 [Tauri 平台依赖](https://v2.tauri.app/start/prerequisites/)，然后执行：

```sh
npm ci
npm run check
npm test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
npx playwright install chromium
npm run test:ui:headless
npm run tauri -- dev
```

原生历史验收脚本会操作鼠标或剪贴板，不属于自动 CI。必须使用新建的 `DEVPAD_DATA_DIR`，不要连接日常使用的实例。新的 MCP 集成测试使用官方 TypeScript 客户端和临时数据库，不操作桌面或系统剪贴板：

```sh
DEVPAD_TEST_EXE=你的构建二进制 node tests/mcp-integration.mjs
```

推送 `develop` 后 GitHub Actions 检查前端、运行 Rust 测试，构建四种平台安装包并进行真实 MCP 集成测试。所有目标通过后发布 `v0.7.0-dev.运行号`，`dev-latest/latest.json` 指向该版本不可变安装包。失败不会推进更新入口。稳定版本从 `main` 的正式版本标签发布。

发布用的 `TAURI_SIGNING_PRIVATE_KEY` 已作为仓库 Secret 配置，公钥随应用分发。私钥只在本机仓库以外备份，不应提交。更换公钥需要先用旧密钥发布可识别新密钥的过渡版本。平台代码签名可后续在 CI 配置 Windows 证书及 Apple 签名、公证凭证。

完整产品分析见 [重构 PRD](docs/prd/devpad-refactor-prd-v0.1.md)。当前实现建立笔记、导出、草稿、MCP 任务与发布更新的基础；大型列表虚拟化和进一步拆分主界面仍有优化空间。

## 许可

DevPad 采用 [PolyForm Noncommercial 1.0.0](LICENSE)，商业用途不获本许可证授权，允许的非商业使用、修改与分发以许可证全文为准。公开源码不意味着允许商业使用。Copyright (c) 2026 PENG1028，必需声明见 [NOTICE](NOTICE)。

第三方依赖保留各自许可证，详见 [第三方声明](THIRD_PARTY_NOTICES.md)，也随安装包分发。
