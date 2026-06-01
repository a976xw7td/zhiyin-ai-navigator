# 智引 AI 导航导师 · Zhiyin AI Navigator

**一句话定位**：帮助高校师生在在线教学平台上通过语音快速定位功能、理解课程内容、完成学习任务的 Chrome 浏览器扩展。

## 🎯 解决什么问题

高校在线教学平台（MOOC、Blackboard、教务处系统等）功能入口深、界面复杂，学生经常找不到课、交不上作业。智引 AI 导航导师通过 **语音 + AI** 的方式，让学生说一句话就能完成平台操作。

> "帮我在中国大学 MOOC 上找吴恩达的机器学习课程"  
> "这个页面上怎么提交作业"  
> "帮我把这篇课程公告总结一下"

## ✨ 核心功能

### 🎤 语音控制
- 浏览器内语音唤醒，无需打字
- 支持中文语音识别（硅基流动 SenseVoice ASR）
- 全局快捷键 `Cmd+Shift+Y` 打开侧边栏

### 🧭 智能导航
- 自动识别当前网站，匹配平台专属导航策略
- **20+ 高校平台专项优化**：B 站、中国大学 MOOC、学信网、Blackboard、超星、智慧树、西亚斯官网等
- 语音指令 → 自动点击、滚动、填写表单

### 💬 AI 对话
- 多轮对话，理解上下文
- 支持 **DeepSeek / 硅基流动** 双 API 切换
- 联网搜索（Bing / DuckDuckGo）
- 文件导入提问（PDF / DOCX / PPTX / MD / TXT）

### 📚 知识提取与复习
- 网页内容一键提取、结构化总结
- Markdown 笔记导出
- 学习推荐引擎：根据浏览历史推荐相关课程和资料
- 复习提醒 + 学习进度追踪

### 🖱️ 页面浮窗
- 在支持的平台上自动注入浮动助手 Widget
- 页面内容高亮标注
- 快捷键 `Cmd+Shift+F` 聚焦输入框

### 🛡️ 伦理护栏
- 禁止代做测验/考试/作业
- 敏感页面（学信网等）仅导航不收集信息
- 所有 API 调用使用用户自己的 Key

## 🚀 安装

```bash
# 1. 克隆仓库
git clone https://github.com/a976xw7td/zhiyin-ai-navigator
cd zhiyin-ai-navigator

# 2. 打开 Chrome
#    地址栏输入 chrome://extensions/

# 3. 开启右上角「开发者模式」

# 4. 点击「加载已解压的扩展程序」→ 选择本文件夹

# 5. 点击浏览器右上角扩展图标，打开「智引 AI 导航导师」
```

**首次使用**：打开侧边栏 → 设置 → 填入 API Key（支持 DeepSeek 或硅基流动）。没有 API Key 可先打开演示模式体验。

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd+Shift+Y` | 打开/关闭侧边栏 |
| `Cmd+Shift+F` | 聚焦页面浮窗输入框 |

## 🧱 技术栈

| 层级 | 技术 |
|------|------|
| 扩展框架 | Chrome Manifest V3 |
| 侧边栏 | Side Panel API |
| 后台 | Service Worker |
| 内容注入 | Content Scripts + Floating Widget |
| AI 模型 | DeepSeek V3 / 硅基流动 |
| 语音识别 | SenseVoice ASR（硅基流动） |
| 语音合成 | Chrome TTS API |
| 文档解析 | PDF.js + Mammoth.js（DOCX）+ JSZip（PPTX） |
| 图标 | Lucide Icons |
| 存储 | Chrome Storage API |

## 📁 项目结构

```
zhiyin-ai-navigator/
├── manifest.json              # 扩展配置
├── background/
│   └── service-worker-bundle.js  # 后台服务
├── sidepanel/                 # 侧边栏主界面
│   ├── sidepanel.html
│   ├── sidepanel.js           # 主逻辑（工作台/对话/笔记/复习/历史/设置）
│   ├── chat-view.js           # 对话视图组件
│   ├── chat-store.js          # 对话存储
│   └── chat.css
├── content/                   # 页面注入脚本
│   ├── content.js             # 主注入入口
│   ├── widget-ui.js           # 浮动助手 UI
│   ├── widget-content.js      # 页面内容提取
│   ├── highlight.js           # 页面高亮
│   ├── recording.js           # 页面操作录制
│   └── shared.js              # 共享工具
├── lib/                       # 核心库
│   ├── llm-client.js          # LLM API 客户端
│   ├── asr-client.js          # 语音识别客户端
│   ├── tts-client.js          # 语音合成客户端
│   ├── site-profiles.js       # 20+ 平台专项优化配置
│   ├── intent-router.js       # 意图路由
│   ├── knowledge-extractor.js # 知识提取
│   ├── learning-recommender.js# 学习推荐引擎
│   ├── context-fusion.js      # 上下文融合
│   ├── dom-distiller.js       # DOM 蒸馏
│   ├── selector-engine.js     # 选择器引擎
│   ├── note-composer.js       # 笔记合成
│   ├── task-queue.js          # 任务队列
│   ├── workflow-state.js      # 工作流状态
│   ├── collab-state.js        # 协作状态
│   ├── ethics-guard.js        # 伦理护栏
│   ├── demo-scenarios.js      # 演示场景
│   ├── lang.js                # 多语言
│   └── exporter.js            # 导出工具
├── offscreen/                 # 离屏文档（TTS）
├── assets/                    # 图标资源
└── 安装说明.txt
```

## 🏫 已适配平台（部分）

| 平台 | 类型 | 专项能力 |
|------|------|----------|
| 中国大学 MOOC | 在线课程 | 课程搜索、章节定位、作业入口 |
| 学信网 | 学籍管理 | 学籍查询、学历认证导航（仅导航，不收集信息） |
| B 站 | 学习视频 | 教程搜索、合集筛选、收藏管理 |
| 西亚斯官网 | 校园门户 | 通知公告、学院导航、教务入口 |
| Blackboard | LMS | 课程定位、作业提交、成绩查看 |
| 超星学习通 | 综合平台 | 课程搜索、任务提交 |
| 智慧树 | 在线课程 | 课程导航、考试入口 |
| 学堂在线 | MOOC | 课程搜索、证书查看 |
| 知网 | 学术 | 论文检索、引用导出 |

## 📄 License

MIT License
