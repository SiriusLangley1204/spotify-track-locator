# Spotify Track Locator · 当前歌曲定位

[中文](#中文) | [English](#english)

## 中文

Spicetify 桌面扩展：点击主列表右下角的定位按钮，将当前播放歌曲滚动到列表中间并短暂高亮。当前版本 **1.3.0**。

### 功能

- 一个绿色定位按钮，固定在主列表右下角、底部播放栏上方。
- Spotify 窗口内支持 `Alt+L`；输入文字时不会触发。
- 按曲目 URI 精确匹配，支持重定向及可用 UID，不用歌曲标题或选中状态猜测。
- 支持虚拟列表：优先读取当前视图缓存或分页结果，必要时分段扫描。
- 兼容新版 `now-playing-widget-v2`，播放接口为空时读取正在播放组件的曲目属性。
- 确认目标行实际进入视口后才提示成功；换歌或换页时取消旧请求。
- `Shift + 点击`同一按钮复制诊断，不包含歌曲名称、原始曲目 URI 或登录凭据。

### 支持范围与验证

这是 **Spotify 桌面客户端 + Spicetify** 扩展，不能直接安装到 Android 或 iOS 官方客户端。

已在 Windows、Spotify `1.3.0.277`、Spicetify `2.44.0` 环境中取得实际客户端诊断：

```json
{
  "version": "1.3.0",
  "stage": "located",
  "playbackSource": "now-playing-widget-props",
  "grids": 1,
  "lastResult": { "status": "located" }
}
```

21 项自动化测试通过。上述结果覆盖一个实际客户端环境，不代表所有歌单、筛选条件和平台都已验证。macOS/Linux 未进行实际客户端验收。Spotify 的内部 React 结构会随升级变化，升级后可能需要适配。

### 安装

前置：安装 Spotify 桌面版并完成 [Spicetify 设置](https://spicetify.app/docs/getting-started)。扩展运行不需要 Node.js；只有开发测试需要 Node.js 18 或更高版本。

1. 下载或克隆本仓库。
2. 运行 `spicetify -c` 查看当前配置文件位置。把 `locate-playing-track.js` 放入同一配置目录下的 `Extensions` 文件夹；替换已有文件前自行备份。
3. 启用扩展：

   ```shell
   spicetify config extensions locate-playing-track.js
   spicetify apply
   ```

   `config extensions` 会追加条目，不会替换已有扩展列表。参见 [Spicetify 官方扩展说明](https://spicetify.app/docs/customization/extensions)。

4. 完全退出并重新打开 Spotify，打开包含当前歌曲的列表，点击定位按钮。

卸载：

```shell
spicetify config extensions locate-playing-track.js-
spicetify apply
```

### 验收与排错

1. 播放列表中的一首歌，将对应行滚出屏幕，点击定位或按 `Alt+L`。
2. 检查歌曲是否进入视口并短暂高亮；滚动列表时按钮高度应保持不变。
3. 切换到不包含当前歌曲的列表，确认没有错误高亮其他歌曲。
4. 失败时先点击定位，再按住 Shift 点击同一按钮，反馈诊断、Spotify/Spicetify 版本和页面类型。

定位只针对当前打开的列表，不会自动导航到其他歌单。筛选可能隐藏当前歌曲。分段查找会短暂滚动列表；未找到时尽可能恢复原位置。

### 开发与测试

无 npm 依赖，也不需要构建：

```shell
npm test
npm run check
```

也可直接运行：

```shell
node --test locate-playing-track.test.cjs browser-regression.test.cjs
node --check locate-playing-track.js
```

浏览器测试使用模拟 DOM、React 属性与虚拟滚动视图。真实客户端验收仍需单独完成。

### 文档

- [实现与排查流程](WORKFLOW.md)
- [Android 可行性与限制](ANDROID.md)
- [版本记录](CHANGELOG.md)

只收录扩展、测试及通用文档，不包含 Spotify 安装包、个人配置、机器路径、历史备份或账号凭据。本项目并非 Spotify 官方项目。

---

## English

A Spicetify desktop extension that scrolls the currently playing track to the center of the current list and briefly highlights it. Click the locator button at the bottom right of the main list. Current version: **1.3.0**.

### Features

- A single green locator button, fixed at the bottom right of the main list, above the playback bar.
- Press `Alt+L` while Spotify has focus. The shortcut is ignored when typing in a text field.
- Matches exact track URIs, with support for track relinking and available UIDs, rather than guessing from titles or selected rows.
- Supports virtualized lists: uses the current view's cache or paginated data first, then scans the list in sections if needed.
- Supports the newer `now-playing-widget-v2`; reads the playing track from the widget's props when the playback API has no data.
- Reports success only after the target row enters the visible area. Changing tracks or pages cancels the pending request.
- `Shift + click` the same button to copy diagnostics without song names, raw track URIs, or login credentials.

### Compatibility and validation

This extension requires **Spotify desktop + Spicetify**. It cannot be installed directly into the official Android or iOS app.

A real client running Windows, Spotify `1.3.0.277`, and Spicetify `2.44.0` returned the following diagnostic result:

```json
{
  "version": "1.3.0",
  "stage": "located",
  "playbackSource": "now-playing-widget-props",
  "grids": 1,
  "lastResult": { "status": "located" }
}
```

All 21 automated tests passed. This client result covers one environment; it does not establish compatibility with every playlist, filter, or platform. Real-client validation on macOS and Linux has not been performed. Spotify updates may change the internal React structures and require adjustments to the extension.

### Installation

First, install Spotify desktop and complete the [Spicetify setup](https://spicetify.app/docs/getting-started). Node.js is not required to run the extension; Node.js 18 or later is only needed for development and testing.

1. Download or clone this repository.
2. Run `spicetify -c` to find your configuration file. Copy `locate-playing-track.js` into the `Extensions` folder alongside that configuration file. Back up any existing copy before replacing it.
3. Enable the extension:

   ```shell
   spicetify config extensions locate-playing-track.js
   spicetify apply
   ```

   `config extensions` appends the entry without replacing your existing extension list. See the [official Spicetify extension instructions](https://spicetify.app/docs/customization/extensions).

4. Fully exit and reopen Spotify. Open a list containing the currently playing track, then click the locator button.

To uninstall:

```shell
spicetify config extensions locate-playing-track.js-
spicetify apply
```

### Manual checks and troubleshooting

1. Play a track from the list, scroll its row out of view, and click the locator button or press `Alt+L`.
2. Check that the track scrolls into view and briefly highlights. The button should stay at the same height as you scroll.
3. Open a list that does not contain the playing track and check that no unrelated row is highlighted.
4. If locating fails, click the button once, then hold Shift and click it again. Include the copied diagnostics, your Spotify/Spicetify versions, and the page type in your report.

The extension searches only the currently open list; it does not navigate to another playlist. Filters may hide the playing track. A fallback scan briefly scrolls the list and attempts to restore the starting position if no match is found.

### Development and testing

No npm dependencies or build step are required:

```shell
npm test
npm run check
```

Alternatively, run the checks directly:

```shell
node --test locate-playing-track.test.cjs browser-regression.test.cjs
node --check locate-playing-track.js
```

Browser tests use a simulated DOM, React props, and virtualized scrolling. Real-client validation is still a separate step.

### Documentation

The following documents are currently in Chinese:

- [Implementation and troubleshooting workflow](WORKFLOW.md)
- [Android feasibility and limitations](ANDROID.md)
- [Changelog](CHANGELOG.md)

This repository contains only the extension, tests, and general documentation. It does not include Spotify binaries, personal configuration, local machine paths, historical backups, or account credentials. This is not an official Spotify project.
