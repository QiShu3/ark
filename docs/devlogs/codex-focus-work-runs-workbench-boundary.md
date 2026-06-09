# 开发日志：codex/focus-work-runs-workbench-boundary

> 完整历史记录分片。维护规则见 [../开发日志.md](../开发日志.md)。

### 2026-06-08 20:53 · PENDING · docs(focus-work): add run and workbench boundary redesign spec

- 用户提出的需求：
  - “我想只让全屏工作台负责任务相关的功能，子应用的专注工作只提供工作内容本身，不涉及任务相关的业务功能”
  - “对了，记得子应用去除 专注工作的任务业务功能”

- 本次完成的工作：
  - 新增 [focus_work_runs 与全屏工作台边界重构设计文档](../superpowers/specs/2026-06-08-focus-work-runs-and-workbench-boundary-design.md)，系统梳理 counted run / extra run 模型、工作台主体状态面、run 与 workflow 双状态机、API 事件流和分阶段迁移计划
  - 在设计文档中明确“子应用去任务化”硬约束，要求子应用专注工作只保留内容执行、内容进度保存和内容自然完成信号，不再承载任务完成、阶段流转、再来一轮等业务功能

- 验证情况：
  - 文档提交，无额外代码验证
