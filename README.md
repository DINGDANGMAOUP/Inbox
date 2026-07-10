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
bun run typecheck
bun run test
bun run check
```

## 图标与主题资产

品牌、主题背景和 app icon 都是提交到仓库的静态资源。需要重新生成时：

```bash
python3 -m pip install -r scripts/requirements-assets.txt
python3 scripts/generate_app_assets.py
```

`scripts/check-*.ts` 是 EPUB、TXT、章节切分和 Readium 内部出版物的轻量回归检查，统一由 `bun run test` 执行。`scripts/set-android-release-version.mjs` 同步更新 `app.json` 与 `package.json`，供 Android 发布流程使用。

## 当前边界

- 不支持 PDF。
- 不做账号、云同步、远程下载或书城。
- Web 端保持可运行即可，主要验收平台是 iOS 和 Android。
