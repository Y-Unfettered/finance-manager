# 开发规范 skill 与经验库 —— 位置与分享指南

> 2026-11-08 任务"开发规范 skill 包 + 个人经验库"产出。
> 本文件说明：所有产出的**具体位置**、**分享哪些东西**、同事怎么装、以及已通过的验证。

## 一、产出位置总览

| 产出 | 具体位置 | 说明 |
|---|---|---|
| 开发规范 skill | `~/.agents/skills/dev-workflow/` | 含 SKILL.md（六步流程）+ assets/当前任务模板.md + README.md，自包含 |
| 个人经验库 | `~/.zcode/lessons.md` | 4 条踩坑经验（Tags / Problem / Solution / Verified + 适用场景） |
| 全局指针 | `~/.zcode/AGENTS.md`（"经验库（按需读）"节） | 涉及技术方案/踩坑问题时按需读经验库对应 tag 章节 |
| 任务归档 | `docs/归档/2026-11-08_开发规范skill包与个人经验库.md` | 本任务完整记录（沟通、范围、验收、测试清单） |
| 本指南 | `docs/开发规范skill与经验库_分享指南.md` | 你正在看的这份 |

> Windows 路径写法：`C:\Users\lemon\.agents\skills\dev-workflow\`、`C:\Users\lemon\.zcode\lessons.md`、`C:\Users\lemon\.zcode\AGENTS.md`。

## 二、分享给同事：分享哪些东西

同事用什么工具，就按哪种：

### 方式 A —— 只要通用方法（默认推荐）
**分享 `dev-workflow/` 整个目录**（SKILL.md + assets/当前任务模板.md + README.md，自包含）。

### 方式 B —— 通用方法 + 个人经验库
**分享 `dev-workflow/` 目录 + `~/.zcode/lessons.md`**。
- lessons.md 是**个人踩坑经验，仅供参考**——别人的坑未必适用他的项目，需结合自己项目验证后再采用。
- 若要"忘了命令也自动生效"：把 SKILL.md 正文流程要点粘贴进同事的全局 AGENTS.md（双保险）。

## 三、同事怎么安装

1. **ZCode / Codex 生态**：把 `dev-workflow/` 放到用户级 skills 目录
   - 首选 `~/.agents/skills/`（标准跨工具位置）
   - 或 `~/.zcode/skills/`（ZCode）、`~/.codex/skills/`（Codex）
2. **豆包等其他工具**：按该工具的技能目录 / 导入方式尝试接入。
   - 本次实测：**豆包能通过斜杠 `/dev-workflow` 找到并唤起**（已通过）。
   - 其他工具仍以实测为准，不保证兼容。
3. **用法**：`/dev-workflow` 手动唤起；或不输命令，输入开发需求时由 description **自动触发**。

## 四、已验证结果（全部通过）

| 测试点 | 结果 |
|---|---|
| ZCode Skill 工具加载 dev-workflow | ✅ |
| ZCode 新对话斜杠 `/dev-workflow` 唤起 | ✅ |
| description 自动触发（不输命令，给开发需求即走六步） | ✅ |
| 豆包跨工具斜杠唤起 | ✅ |
| 经验库 4 条条目、格式齐 | ✅ |
| AGENTS.md 指针在位、措辞"按需读" | ✅ |
| 目录自包含（SKILL.md + 模板 + README） | ✅ |

## 五、一句话

**把 `dev-workflow/` 文件夹拷给同事就能用；要经验库再加 `lessons.md`（仅供参考）。**
