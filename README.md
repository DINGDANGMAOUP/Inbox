# 墨屿 / Inbox

现代化离线本地电子书阅读器，面向 iOS 和 Android。首版支持导入 EPUB 与 TXT，本地保存书籍、章节、搜索索引、阅读进度、书签、划线和笔记。

## 开发

```bash
bun install
bun run start
```

常用命令：

```bash
bun run android
bun run ios
bun run web
bun run lint
bunx tsc --noEmit
```

## 图标与主题资产

品牌、主题背景和 app icon 都是静态资源，生成脚本在 `scripts/`：

```bash
node scripts/generate-theme-assets.js <source-png>
node scripts/generate-logo-assets.js <source-png>
node scripts/build-app-icons.js
```

## 当前边界

- 不支持 PDF。
- 不做账号、云同步、远程下载或书城。
- Web 端保持可运行即可，主要验收平台是 iOS 和 Android。
