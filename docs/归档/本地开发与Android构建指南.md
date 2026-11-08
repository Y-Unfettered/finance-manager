# 财务经理 APP：本地开发与 Android 构建指南

本文适用于当前项目：

- 项目根目录：`D:\finance-manager`
- Web/Capacitor 工程：`D:\finance-manager\app`
- Android Studio 工程：`D:\finance-manager\app\android`
- Android applicationId：`app.financemanager.local`
- 当前技术栈：Vue 3、Vite、Capacitor 8、Vant 4、ECharts 5、Android Gradle Plugin 8.13

## 一、先理解构建流程

修改 `app/src` 中的 Vue、TypeScript 或 CSS 后，代码不会自动进入 APK。完整流程是：

```text
app/src 源码
  → npm run build
  → app/dist Web 产物
  → cap copy / cap sync
  → app/android/app/src/main/assets/public
  → Gradle / Android Studio
  → APK
```

最容易遗漏的是中间的 `build` 和 `cap copy/cap sync`。如果 APK 中还是旧页面，通常就是没有完成这两步。

## 二、首次准备开发环境

### 2.1 必备软件

当前电脑已经使用下列环境成功构建过本项目：

- Node.js 24.x
- npm 11.x
- Android Studio（自带 JDK 21）
- Android SDK Platform 36
- Android SDK Build-Tools
- Android SDK Platform-Tools（包含 `adb`）

检查 Node 和 npm：

```powershell
node --version
npm --version
```

检查 Android Studio 自带的 Java：

```powershell
& 'C:\Program Files\Android\Android Studio\jbr\bin\java.exe' -version
```

### 2.2 首次安装前端依赖

打开 PowerShell：

```powershell
Set-Location 'D:\finance-manager\app'
npm ci
```

项目已有 `package-lock.json`，使用 `npm ci` 可以严格按锁定版本安装。以后主动新增依赖时，使用：

```powershell
npm install 包名
```

### 2.3 PowerShell 找不到 Java 时

Android Studio 已附带 JDK，无须另外下载。当前 PowerShell 会话可这样配置：

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
```

可选：让 Gradle 缓存统一保存在项目目录：

```powershell
$env:GRADLE_USER_HOME = 'D:\finance-manager\.gradle-cache'
```

这些命令只影响当前 PowerShell 窗口，关闭窗口后需要重新设置。Android Studio 自己运行 Gradle 时，使用其设置中的 Gradle JDK，不依赖这个临时变量。

## 三、编译并打包 APK

### 3.1 推荐：先完成质量检查

```powershell
Set-Location 'D:\finance-manager\app'
npm run lint
npm test
npm run build
```

命令含义：

| 命令            | 作用                                 |
| --------------- | ------------------------------------ |
| `npm run lint`  | 检查代码规范和明显错误               |
| `npm test`      | 运行全部自动化测试                   |
| `npm run build` | TypeScript 类型检查并生成 `app/dist` |

如果只是临时看效果，可以先跳过 lint/test；正式保留或发布版本时建议全部执行。

### 3.2 将最新 Web 代码同步进 Android 工程

推荐直接运行项目已有命令：

```powershell
Set-Location 'D:\finance-manager\app'
npm run cap:sync
```

它实际会依次执行：

```text
npm run build
cap sync
```

如果刚刚已经运行过 `npm run build`，并且只修改了 Vue、CSS、图片等 Web 内容，也可以使用较快的复制命令：

```powershell
npx cap copy android
```

选择规则：

- 只改 Vue、TypeScript、CSS、图片：`npm run build` + `npx cap copy android`
- 修改 Capacitor 插件、`capacitor.config.ts` 或原生依赖：`npm run cap:sync`
- 不确定时：直接使用 `npm run cap:sync`

### 3.3 使用命令行生成 Debug APK

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:GRADLE_USER_HOME = 'D:\finance-manager\.gradle-cache'
Set-Location 'D:\finance-manager\app\android'
.\gradlew.bat assembleDebug
```

构建成功后，APK 位于：

```text
D:\finance-manager\app\android\app\build\outputs\apk\debug\app-debug.apk
```

Debug APK 适合自己安装、调试和快速验收，不适合应用商店正式发布。

### 3.4 构建并直接安装到已连接手机

先确认手机已连接且授权：

```powershell
adb devices -l
```

设备状态应为 `device`，不能是 `unauthorized` 或 `offline`。

然后执行：

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:GRADLE_USER_HOME = 'D:\finance-manager\.gradle-cache'
Set-Location 'D:\finance-manager\app\android'
.\gradlew.bat installDebug
```

也可以手动安装已经生成的 APK：

```powershell
adb install -r 'D:\finance-manager\app\android\app\build\outputs\apk\debug\app-debug.apk'
```

`-r` 表示覆盖安装并尽量保留应用数据。

> 重要：不要为了安装新包随便卸载应用或清除应用数据。本项目的财务数据主要保存在手机本地；卸载、清除数据前必须先在 APP 内完成备份。

### 3.5 生成正式签名 APK

当前 `app/android/app/build.gradle` 没有保存正式签名配置。正式发布建议使用 Android Studio：

1. 打开 Android 工程。
2. 选择 `Build → Generate Signed App Bundle or APK`。
3. 选择 `APK`。
4. 选择已有 keystore，或首次创建 keystore。
5. 选择 `release`。
6. 完成构建后，点击 Android Studio 通知中的 `locate` 查看产物。

发布前还要修改：

```text
D:\finance-manager\app\android\app\build.gradle
```

其中：

- `versionCode`：每次发布必须递增。
- `versionName`：用户看到的版本号。

同时建议同步修改 `app/package.json` 中的版本号。

不要把 keystore、别名密码或签名密码提交到 Git 仓库。

## 四、网页运行与样式调试

### 4.1 启动 Vite 开发服务器

```powershell
Set-Location 'D:\finance-manager\app'
npm run dev
```

终端通常会显示：

```text
http://localhost:5173/
```

在浏览器打开这个地址。修改 `app/src` 下的 Vue 或 CSS 后，页面会热更新，通常不用手动刷新。

停止服务：在运行 Vite 的 PowerShell 窗口按 `Ctrl+C`。

### 4.2 模拟手机尺寸调样式

以 Chrome 或 Edge 为例：

1. 打开 `http://localhost:5173/`。
2. 按 `F12` 打开开发者工具。
3. 点击设备工具栏按钮，或按 `Ctrl+Shift+M`。
4. 选择接近目标手机的宽高，也可以手动输入，例如 `390 × 844`。
5. 修改 Vue/CSS，观察热更新结果。

适合在网页中快速调整：

- 间距、字号、颜色、圆角和阴影
- 卡片布局
- Vant 弹层
- ECharts 图表尺寸和颜色
- 普通 Vue 页面交互

### 4.3 网页预览的限制

本项目是 Android 本地优先应用，使用了 Capacitor SQLite、文件系统等原生能力。普通浏览器环境不能完整模拟这些能力，因此可能出现：

- 账本尚未准备好
- 没有真实账户或交易数据
- 备份、文件选择等功能不可用
- 浏览器效果与 Android WebView 存在少量差异

所以网页预览适合调样式和基础交互；数据库、文件、返回键、状态栏、安全区、真机滚动等必须在 Android 模拟器或真机中复测。

## 五、真机实时调试 Vue 和 CSS

如果不想每改一次 CSS 都重新打 APK，可以使用 Capacitor Live Reload。

### 5.1 USB 方式（推荐）

先连接手机并确认：

```powershell
adb devices -l
```

终端 A 启动 Vite：

```powershell
Set-Location 'D:\finance-manager\app'
npm run dev -- --host 127.0.0.1
```

终端 B 构建并运行 Live Reload 版本：

```powershell
Set-Location 'D:\finance-manager\app'
npx cap run android --live-reload --host 127.0.0.1 --port 5173 --forwardPorts 5173:5173
```

如果连接了多台设备，先查看目标：

```powershell
npx cap run android --list
```

再指定设备：

```powershell
npx cap run android --target 设备ID --live-reload --host 127.0.0.1 --port 5173 --forwardPorts 5173:5173
```

此时修改 Vue/CSS，手机中的应用会连接本机 Vite 服务并自动刷新。

结束 Live Reload 后，在生成普通 APK 前重新执行：

```powershell
npm run cap:sync
```

这样可以确保 APK 使用打包进应用的 `dist`，而不是依赖电脑上的开发服务器。

### 5.2 调试 WebView 中的 JavaScript

手机通过 USB 连接后，可以在桌面 Chrome 打开：

```text
chrome://inspect/#devices
```

找到 `app.financemanager.local` 对应的 WebView，点击 `inspect`，即可查看：

- Console 日志和报错
- Elements 与 CSS
- Network 请求
- Local Storage

财务数据属于敏感数据，截图、复制日志或远程协助前应先检查其中是否包含真实账户和交易信息。

## 六、在 Android Studio 中直接测试

### 6.1 第一次打开前先同步

```powershell
Set-Location 'D:\finance-manager\app'
npm run cap:sync
```

然后执行：

```powershell
npm run android:open
```

也可以手动使用 Android Studio 打开：

```text
D:\finance-manager\app\android
```

不要打开 `D:\finance-manager` 或 `D:\finance-manager\app` 作为 Android 工程；应打开其中的 `android` 目录。

### 6.2 Android Studio 初次配置

1. 等待右下角 Gradle Sync 完成。
2. 打开 `File → Settings → Build, Execution, Deployment → Build Tools → Gradle`。
3. 将 `Gradle JDK` 设为 Android Studio 的 Embedded JDK/JBR 21。
4. 打开 `Tools → SDK Manager`，确认已安装 Android SDK Platform 36 和 Platform-Tools。
5. 如果 Android Studio 提示安装缺失的 SDK 或 Build-Tools，按提示安装后重新 Sync。

### 6.3 使用真机运行

手机端需要：

1. 开启开发者选项。
2. 开启 USB 调试。
3. 部分品牌还需要开启“通过 USB 安装”或类似选项。
4. 连接电脑后，在手机弹窗中允许本电脑调试。

在 Android Studio 顶部：

1. 运行配置选择 `app`。
2. 设备列表选择已连接手机。
3. 点击绿色运行按钮，或按 `Shift+F10`。

### 6.4 使用模拟器运行

1. 打开 `Tools → Device Manager`。
2. 创建一个 API 36 或兼容版本的虚拟设备。
3. 启动模拟器。
4. 顶部设备列表选择该模拟器。
5. 点击运行。

涉及相机、厂商文件管理、系统通知或真实手机安全区时，仍建议最后用真机验收。

### 6.5 修改代码后怎样让 Android Studio 使用最新页面

如果只改了 Vue、TypeScript、CSS 或图片：

```powershell
Set-Location 'D:\finance-manager\app'
npm run build
npx cap copy android
```

然后回到 Android Studio，再次点击运行。

如果修改了 Capacitor 插件、配置或原生依赖：

```powershell
Set-Location 'D:\finance-manager\app'
npm run cap:sync
```

回到 Android Studio 后，如出现提示，点击 `Sync Project with Gradle Files`，再运行。

如果只改 `app/android` 中的 Kotlin、Java、Manifest 或 Gradle 文件，则通常不需要重新构建 Web，直接在 Android Studio Sync/Run 即可。

### 6.6 在 Android Studio 中生成 Debug APK

菜单选择：

```text
Build → Build Bundle(s) / APK(s) → Build APK(s)
```

完成后点击通知中的 `locate`。默认位置仍为：

```text
D:\finance-manager\app\android\app\build\outputs\apk\debug\app-debug.apk
```

### 6.7 查看运行日志

打开 Android Studio 底部 `Logcat`：

- 设备选择当前手机或模拟器。
- 应用选择 `app.financemanager.local`。
- 重点查看 `Error`、`FATAL EXCEPTION`、`chromium`、`Capacitor` 和 SQLite 相关日志。

网页脚本和样式问题优先使用 `chrome://inspect`；Android 原生、插件、权限和崩溃问题优先查看 Logcat。

## 七、常见问题

### 7.1 `JAVA_HOME is not set`

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
```

然后重新运行 Gradle 命令。

### 7.2 `adb` 不是可识别的命令

直接使用当前 Android SDK 中的 adb：

```powershell
& 'C:\Users\lemon\AppData\Local\Android\Sdk\platform-tools\adb.exe' devices -l
```

或者把以下目录加入 Windows PATH：

```text
C:\Users\lemon\AppData\Local\Android\Sdk\platform-tools
```

### 7.3 手机显示 `unauthorized`

1. 解锁手机。
2. 拔掉并重新连接 USB。
3. 在手机上确认“允许 USB 调试”。
4. 再运行 `adb devices -l`。

### 7.4 APK 中还是旧样式

按顺序重新执行：

```powershell
Set-Location 'D:\finance-manager\app'
npm run cap:sync
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:GRADLE_USER_HOME = 'D:\finance-manager\.gradle-cache'
Set-Location 'D:\finance-manager\app\android'
.\gradlew.bat installDebug
```

如果仍是旧页面，先强制停止 APP 再打开。不要把“卸载应用”作为第一解决办法，以免删除本地财务数据。

### 7.5 Android Studio Gradle Sync 失败

依次检查：

- Gradle JDK 是否为 JBR 21。
- SDK Platform 36 是否安装。
- 网络是否可以访问 Google Maven 和 Maven Central。
- `app/android/local.properties` 中的 `sdk.dir` 是否指向正确 Android SDK。

当前电脑应为：

```properties
sdk.dir=C\:\\Users\\lemon\\AppData\\Local\\Android\\Sdk
```

### 7.6 应用白屏或页面没有数据

1. 确认执行过 `npm run cap:sync`。
2. 查看 Android Studio Logcat。
3. 使用 `chrome://inspect/#devices` 查看 WebView Console。
4. 如果只在普通浏览器中没有数据，先确认是否属于 SQLite 等原生能力限制。

## 八、推荐的日常工作顺序

### 只调整样式

```text
npm run dev
→ 浏览器设备模式调整
→ 真机 Live Reload 复核
→ npm run lint
→ npm test
→ npm run cap:sync
→ gradlew installDebug
```

### 开发完整功能

```text
修改源码
→ npm run lint
→ npm test
→ npm run build
→ npm run cap:sync
→ Android Studio 真机测试
→ 备份验证
→ 生成 Debug 或正式签名 APK
```

## 九、常用命令速查

以下命令默认在 `D:\finance-manager\app` 执行：

| 操作                | 命令                         |
| ------------------- | ---------------------------- |
| 安装锁定依赖        | `npm ci`                     |
| 启动网页开发服务器  | `npm run dev`                |
| 类型检查并构建 Web  | `npm run build`              |
| 运行全部测试        | `npm test`                   |
| 代码规范检查        | `npm run lint`               |
| 构建并同步 Android  | `npm run cap:sync`           |
| 只复制最新 Web 产物 | `npx cap copy android`       |
| 打开 Android Studio | `npm run android:open`       |
| 查看可运行设备      | `npx cap run android --list` |

以下命令默认在 `D:\finance-manager\app\android` 执行：

| 操作                  | 命令                          |
| --------------------- | ----------------------------- |
| 生成 Debug APK        | `.\gradlew.bat assembleDebug` |
| 构建并安装到设备      | `.\gradlew.bat installDebug`  |
| 清理 Android 构建产物 | `.\gradlew.bat clean`         |
