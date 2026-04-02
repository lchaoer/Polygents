# Polygents

多智能体协作框架 — 给 AI 一个组织架构。

Agent 通过文件系统 Markdown 文件通信，Manager 拆解任务、Dev 执行开发、Evaluator 评审质量，三角色自动闭环协作。

## 快速启动

### 环境要求

- **Python** >= 3.10
- **Node.js** >= 18
- **npm** >= 9

### 1. 安装后端依赖

```bash
cd Polygents/backend
pip install -e ".[dev]"
```

### 2. 安装前端依赖

```bash
cd Polygents/frontend
npm install
```

### 3. 启动后端

```bash
cd Polygents/backend
python -m app.main
```

后端运行在 **http://127.0.0.1:8001**。

### 4. 启动前端

```bash
cd Polygents/frontend
npm run dev
```

前端运行在 **http://localhost:5173**。

### 5. 开始使用

1. 打开 http://localhost:5173
2. 选择一个团队模板（开发团队 / 研究团队 / 内容团队）
3. 在画布页面输入任务描述，点击"开始运行"
4. 右侧 Activity Feed 实时显示 Agent 协作过程

## 运行测试

```bash
# 后端测试
cd Polygents/backend
python -m pytest -v

# 前端构建检查
cd Polygents/frontend
npm run build
```

## 文档

详细的架构设计、通信机制、开发路线图等请查阅 [docs/](docs/) 目录：

- [设计文档](docs/design.md) — 完整设计规范
- [架构概览](docs/architecture.md) — 系统架构与项目结构
