# Smian's Blog

> Stay hungry, stay foolish.

🌐 Website: [chensimian.github.io](https://chensimian.github.io)

基于 [Zola](https://www.getzola.org/) 静态站点生成器搭建，主题参考 [minglovecoding.github.io](https://github.com/minglovecoding/minglovecoding.github.io)。

## 本地预览

```bash
zola serve
```

打开 http://127.0.0.1:1111 查看效果。

## 写作

新文章放在 `content/Blog/<年份>/<月份>/` 下，Markdown 格式，前面加上 frontmatter：

```toml
+++
title = "文章标题"
date = 2026-04-27
[taxonomies]
tags = ["标签1", "标签2"]
+++
```

## 部署

推送到 `main` 分支后，GitHub Actions 会自动构建并部署到 GitHub Pages。
