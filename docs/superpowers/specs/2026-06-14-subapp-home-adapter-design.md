# SubApp Home Page — Focus Work Adapter Pattern

## Context

ERC Home (523行)、Vocab Home (309行)、GenericChoiceQuestionHome (140行) 三个首页各自管理数据获取、状态、配置弹窗逻辑。问题在于把**专注工作 (focus work)** 的差异和**子应用**绑在了一起——用 `app.focusWorks[0].template` 选 adapter 实际上把整个首页按第一个 focusWork 分类。

正确的分类单位是 focus work。一个子应用有多个 focusWork（如 ERC 有 erc_practice + erc_review），每个 focusWork 独立贡献自己的资产区和指标区。

## 分层边界

```
SubAppHome (app-level)
  ├── hero           — app.name / status / overall progress / primaryAction
  ├── arrangements   — 所有 focusWork 的任务列表（聚合）
  ├── config modal   — 统一配置所有 focusWork
  ├── feedback       — 子应用级提示
  │
  └── per-focus-work (由声明驱动)
        ├── metrics       — focusWork 专属的指标
        └── assetContent  — focusWork 专属的长期积累资产
```

- **app-level**: 编排、聚合、配置。与模板类型无关。
- **focus-work-level**: metrics + asset。由 `FocusWorkDeclaration.template` 决定。

## Architecture

```
DynamicSubAppHome({ appId })
  ├── 从 registry 取 app 声明
  │
  ├── SubAppHome (app-level hook)
  │     ├── useSubAppHome(...)         ← config / save / init / refresh
  │     │
  │     ├── for each focusWork:
  │     │     └── useFocusWorkAdapter(focusWork, app.id)
  │     │           ├── metrics
  │     │           └── assetContent
  │     │
  │     └── 聚合
  │           ├── allMetrics = adapters.flatMap(a => a.metrics)
  │           └── assetContent = adapters.map(a => a.assetContent)
  │
  └── SubAppHomeTemplate
        ├── <HeroSection />              ← app-level
        ├── <AssetSection />             ← aggregated from all adapters
        ├── <ArrangementsSection />      ← app-level, one task per focusWork
        ├── <FeedbackSection />          ← app-level
        └── <ModalsSection />            ← app-level (unified config modal)
```

## Adapter Interface

```typescript
// Per-focus-work — only asset + metrics
interface FocusWorkAdapter {
  metrics: SubAppHomeMetric[];
  assetContent: ReactNode | null;      // null = section hidden / loading
}
```

Focus work adapter 是纯数据层 hook，不渲染 UI。每个 focusWork 的 template 决定用哪个 hook：

```
FocusWorkDeclaration.template → adapter hook
  'choice_question' → useChoiceQuestionAdapter(fw, appId)
  'flashcard'       → useFlashcardAdapter(fw, appId)
```

## Two Implementations

### useChoiceQuestionAdapter(fw, appId)

- 覆盖：ERC 的 erc_practice、erc_review、动态 choice_question 的 focusWork
- 取数：`apiJson(/api/{appId}/overview)` — 返回 practiced_count / correct_count / accuracy / due_count / mistake_count
- metrics：待复习、已练习、正确率、错题
- assetContent：题库进度卡 + 错题资产卡 + 今日推荐（每个 focusWork 独立渲染一组卡）

### useFlashcardAdapter(fw, appId)

- 覆盖：Vocab 的 vocab_today、动态 flashcard 的 focusWork
- 取数：`useVocabDeck` + `fetchVocabToday(deckId)` + `fetchVocabOverview(deckId)`
- metrics：今日进度、待完成、新词、复习
- assetContent：词书完成度 / 累计掌握 / 当前词书掌握度 / 分段进度条

## App-Level Hook

```typescript
function useSubAppHomePage(app: SubAppDeclaration) {
  // app-level config
  const home = useSubAppHome({...});

  // per-focus-work adapters
  const adapters = app.focusWorks.map(fw => {
    if (fw.template === 'flashcard') return useFlashcardAdapter(fw, app.id);
    return useChoiceQuestionAdapter(fw, app.id);
  });

  // aggregate
  const allMetrics = adapters.flatMap(a => a.metrics);
  // assetContent — 按 focusWork 分组展示，每个 group 有 label

  // arrangements — app.level: one task per focusWork
  const tasks = app.focusWorks.map((fw, i) => ({
    id: fw.type,
    name: fw.label,
    state: adapters[i]?.state ?? 'uninitialized',
    ...
  }));

  return {
    hero: { ... },
    metrics: allMetrics,
    assetContent,     // aggregated, grouped by focusWork
    arrangements: { tasks, busy: home.busy },
    feedback,
    modals,
    sections: app.sections,
  };
}
```

## DynamicSubAppHome

```typescript
function DynamicSubAppHome() {
  const { appId } = useParams();
  const app = useApp(appId);
  if (!app) return null;

  const page = useSubAppHomePage(app);
  return <SubAppHomeTemplate {...page} />;
}
```

不再有 `hasCustomHome`、不再有 template 分支。

## Migration Steps

1. 新建 `adapters/useFocusWorkAdapter.ts` — 统一入口，按 template dispatch
2. 新建 `adapters/useChoiceQuestionAdapter.ts`
3. 新建 `adapters/useFlashcardAdapter.ts`
4. 提取 HeroSection / AssetSection / ArrangementsSection 为独立组件
5. 改写 `SubAppHomeTemplate` 接收 section props
6. 新建 `useSubAppHomePage` hook（app-level 聚合层）
7. 改写 `DynamicSubAppHome` → 调用 `useSubAppHomePage`
8. 删除 `ERC/Home.tsx`、`Vocab/Home.tsx`、`GenericChoiceQuestionHome.tsx`
9. 删除 `hasCustomHome`、`BUILT_IN_HOME_LOADERS`
10. 迁移 ERC/Vocab 测试到 adapter hook 测试

## What Gets Removed

- `hasCustomHome` 字段（前后端声明 + 持久化）
- `BUILT_IN_HOME_LOADERS` 映射
- `ERC/Home.tsx`（~523 行）
- `Vocab/Home.tsx`（~309 行）
- `GenericChoiceQuestionHome.tsx`（~140 行）

## Test Migration

- ERC 测试 → 测试 `useChoiceQuestionAdapter` 对 erc_practice / erc_review 双 focusWork
- Vocab 测试 → 测试 `useFlashcardAdapter` 对 deck 切换、今日进度
- 新建 `useSubAppHomePage` 集成测试：mock registry，render DynamicSubAppHome

## Verification

1. `pnpm check` — TypeScript 编译通过
2. `pnpm test` — 测试全部通过
3. ERC (/erc) 首页 → 双 focusWork 资产区正常 → 配置弹窗正常
4. Vocab (/vocab) 首页 → deck 切换 / 资产区正常
5. 动态 choice_question 子应用首页正常
6. Admin 新建子应用 → 按声明自动组装
