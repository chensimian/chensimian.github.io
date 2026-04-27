+++
title = "Weekly #01 — Blog Setup & Fresh Start"
date = 2026-04-27
description = "First weekly: Building a blog from scratch"

[taxonomies]
tags = ["Weekly"]
+++

> 本周关键词：**Zola、GitHub Pages、博客搭建、新开始**

## 📋 本周概要

这是 **2026 年第 17 周**（4.21 - 4.27）的周记，也是本博客的第一篇周记。

---

## 🛠 做了什么

### 搭建个人博客
- 选型：经过对比，最终选择 [Zola](https://www.getzola.org/) 作为静态站点生成器
  - 理由：Rust 写的单二进制文件，构建速度极快；Tera 模板够用；直接托管 GitHub Pages
- 参考：[Mingo 的博客](https://github.com/minglovecoding/minglovecoding.github.io) 作为主题基础
- 完成了：
  - ✅ Zola 项目初始化与配置
  - ✅ 自定义样式（暗色主题 + 渐变 + 玻璃拟态）
  - ✅ 部署到 GitHub Pages（`chensimian.github.io`）
  - ✅ 配置 GitHub Actions 自动部署
  - ✅ 写了 Hello World 文章

### 技术踩坑记录
- Zola 0.22 的 markdown 高亮语法变了（旧 `highlight_code = true` 不再支持）
- GitHub Pages 默认 build_type 是 `legacy`，需要改成 `workflow`
- TOML frontmatter 用 `+++` 而非 YAML 的 `---`

---

## 💭 思考与感悟

> 万事开头难。但一旦开始了，后面就顺了。

搭这个博客的过程其实挺有意思的——从选工具、调样式、到解决各种部署问题。每一步都是学习。

**本周最大的收获**：
1. 对 Zola 静态站点生成器的理解更深了
2. GitHub Pages + Actions 的工作流跑通了
3. 暗色主题 + 玻璃拟态的设计确实好看 😎

---

## 🎯 下周计划

- [ ] 多写几篇文章（技术向 / 随笔都可以）
- [ ] 完善 About 页面的自我介绍
- [ ] 探索更多自定义功能（评论系统、统计等）

---

*这就是第一周的全部内容了，下周见 👋*
