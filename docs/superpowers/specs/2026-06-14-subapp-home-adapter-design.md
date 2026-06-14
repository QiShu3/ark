# SubApp Home Page Adapter Pattern

## Context

ERC Home (523行)、Vocab Home (309行)、GenericChoiceQuestionHome (140行) 三个首页各自管理数据获取、状态、配置弹窗逻辑，但它们都渲染到同一个 `SubAppHomeTemplate` 的五段式布局里。当前靠 `DynamicSubAppHome` 里的硬编码派发 (`hasCustomHome` flag + loader map) 选择组件。

把数据层和 UI 层同时统一：数据层用适配器 (Adapter) 模式按模板类型收敛，UI 层拆成无状态的 Section 组件按声明 (`sections`) 渲染。

## Architecture

```
DynamicSubAppHome
  ├── 从 registry 取 app 声明
  ├── app.focusWorks[0].template → 选择 adapter
  │     'choice_question' → useChoiceQuestionAdapter(app)
  │     'flashcard'       → useFlashcardAdapter(app)
  │
  └── SubAppHomeTemplate
        ├── sections 声明 → 控制各区域可见性
        └── adapter props → 驱动各 Section 渲染
```

## Adapter Interface

```typescript
interface SubAppHomeAdapter {
  sections: TemplateSection[];
  hero: HeroSectionProps;
  asset: AssetSectionProps;
  arrangements: ArrangementsSectionProps;
  feedback: ReactNode;
  modals: ReactNode;
}
```

每个 adapter hook 接收 `SubAppDeclaration`，返回 `SubAppHomeAdapter`。Section props 均为已有 `SubAppHomeTemplate` 子区域的类型，不做新类型。

## Two Implementations

### useChoiceQuestionAdapter

- 覆盖：ERC（双 focusWork）、动态 choice_question 子应用（单 focusWork）
- 取数：`apiJson(/api/{appId}/overview)` + 可选的 `fetchSets` (ERC 的题库选择)
- 状态：`useSubAppHome` hook 管 save/init/refresh
- asset：题库进度 / 错题资产 / 今日推荐
- arrangements：单任务 或 双任务（ERC practice + review）
- modals：`SubAppConfigModal`（单模块或双模块）

### useFlashcardAdapter

- 覆盖：Vocab、动态 flashcard 子应用
- 取数：`useVocabDeck` + `fetchVocabToday` + `fetchVocabOverview`
- 状态：`useSubAppHome` hook 管 save/init/refresh
- asset：词书完成度 / 累计掌握 / 当前词书掌握度
- arrangements：单任务（今日单词，无 sync toggle）
- modals：`SubAppConfigModal` + `OverviewDetailModal`

## SubAppHomeTemplate

Props 从 20 个扁平字段简化为接收 adapter 对象：

```typescript
type SubAppHomeTemplateProps = {
  adapter: SubAppHomeAdapter;
};
```

内部根据 `adapter.sections` 条件渲染 hero / asset / arrangements / feedback / modals 区域。

## DynamicSubAppHome

```typescript
function DynamicSubAppHome() {
  const { appId } = useParams();
  const app = useApp(appId);  // loadDynamicRegistry + find
  if (!app) return null;

  const tpl = app.focusWorks[0]?.template;
  const adapter = tpl === 'flashcard'
    ? useFlashcardAdapter(app)
    : useChoiceQuestionAdapter(app);

  return <SubAppHomeTemplate adapter={adapter} />;
}
```

新模板类型只需新增一个 adapter 文件，不在 DynamicSubAppHome 加分支。默认走 `useChoiceQuestionAdapter`。

## Migration Steps

一步完成，不分工期：

1. 新建 `adapters/types.ts`、`useChoiceQuestionAdapter.ts`、`useFlashcardAdapter.ts`
2. 提取 HeroSection / AssetSection / ArrangementsSection 为独立组件
3. 改写 `SubAppHomeTemplate` props 为 adapter 模式，内部用 Section 组件
4. 改写 `DynamicSubAppHome` 为 adapter 派发
5. 删除 `ERC/Home.tsx`、`Vocab/Home.tsx`、`GenericChoiceQuestionHome.tsx`
6. 删除 `hasCustomHome`、`BUILT_IN_HOME_LOADERS`
7. 更新 `subAppRegistry.ts` / `sub_app_registry.py` / `app_registry_routes.py` 移除 `has_custom_home` 字段

## What Gets Removed

- `hasCustomHome` 字段（前后端声明 + 持久化）
- `BUILT_IN_HOME_LOADERS` 映射
- `ERC/Home.tsx`（~523 行）
- `Vocab/Home.tsx`（~309 行）
- `GenericChoiceQuestionHome.tsx`（~140 行）

## Test Migration

ERC/Vocab 的现有测试 (`pages/ERC/__tests__/Home.test.tsx`, `pages/Vocab/__tests__/Home.test.tsx`) 直接引用了即将删除的 Home 组件。需要重写为 adapter hook 的测试：

- ERC 测试 → 测试 `useChoiceQuestionAdapter` 对双 focusWork 场景的处理
- Vocab 测试 → 测试 `useFlashcardAdapter` 对 deck 切换、今日进度的处理
- 新建 adapter 集成测试：mock `/api/app-registry`，render `DynamicSubAppHome`，验证 adapter 选出正确

## Verification

1. `pnpm check` — TypeScript 编译通过
2. `pnpm test` — 测试全部通过（测试从页面组件迁移到 adapter hook）
3. 启动前后端 → Vocab 首页正常 → ERC 首页正常 → 动态 choice_question 子应用正常
4. Admin 新建 flashcard 子应用 → 前端用 useFlashcardAdapter 渲染
5. Admin 新建 choice_question 子应用 → 前端用 useChoiceQuestionAdapter 渲染
