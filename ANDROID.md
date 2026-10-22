# Android：能实现什么

## 现有扩展不能直接安装

本仓库依赖 Spotify 桌面界面的 DOM、React 和 Spicetify。Android 官方客户端不是同一运行环境，不能直接加载这份 JavaScript 扩展。

## 可行的独立伴侣应用

可以另做 Android 应用或移动网页：取得当前播放曲目的 URI，读取经授权可访问的列表，然后在**伴侣应用自己的列表**中定位、高亮当前歌曲。

Spotify 官方 Android SDK 支持当前曲目与上下文元数据及基础播放控制；Web API 也提供当前播放曲目接口。实际开发要先核实应用注册、账号资格、授权范围及可用列表接口，不能假设所有 API 对任意账号开放。

这不能据此控制 Spotify 官方 App 内歌单的滚动位置。官方 Android SDK 说明中没有提供操纵官方 App 列表滚动的能力；它是播放交互接口。这是依据公开接口范围作出的判断。

## 想直接滚动官方 App

需要另行研究 Android 无障碍自动化等方案，并在具体手机、Spotify 版本和列表结构上验证。这类方案依赖界面节点与授权，通常只能分段扫描，不保证取得完整虚拟列表或精确定位；本仓库尚未实现，也未进行手机实测。

## 后续原型的验收条件

1. 取得正确的当前曲目 URI，换歌后及时更新。
2. 读取用户选择且有权限访问的列表，处理分页、重复条目和不可用曲目。
3. 点击定位后，在伴侣应用自己的列表中滚动并高亮；找不到时明确提示。
4. 使用用户授权流程，不把客户端密钥或访问令牌写入公开仓库。

本文件是可行性说明，不代表已经提供 Android 版本。

官方参考（核查于 2026-10-22）：

- [Spicetify 安装与支持环境](https://spicetify.app/docs/getting-started)
- [Spotify Android SDK](https://developer.spotify.com/documentation/android)
- [获取当前播放曲目](https://developer.spotify.com/documentation/web-api/reference/get-the-users-currently-playing-track)
