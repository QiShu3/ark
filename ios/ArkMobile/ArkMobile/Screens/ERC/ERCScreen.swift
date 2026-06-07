import SwiftUI

struct ERCScreen: View {
    @EnvironmentObject private var session: AppSession

    @State private var subpage: ERCSubpage = .overview
    @State private var overview: ERCOverview?
    @State private var configStatus: ERCConfigStatus?
    @State private var sets: [ERCSet] = []
    @State private var articles: [ERCArticleListItem] = []
    @State private var mistakes: [ERCMistakeItem] = []
    @State private var activeExam = ""
    @State private var selectedArticleId: String?
    @State private var articleDetail: ERCArticleDetail?
    @State private var practiceAnswers: [String: String] = [:]
    @State private var practiceResult: ERCArticleSubmitResult?
    @State private var practiceStartedAt = Date()
    @State private var reviewNext: ERCReviewNext?
    @State private var selectedReviewOption: String?
    @State private var reviewResult: ERCReviewSubmitResult?
    @State private var reviewStartedAt = Date()
    @State private var isLoading = false
    @State private var isLoadingArticle = false
    @State private var isSubmittingPractice = false
    @State private var isSubmittingReview = false
    @State private var actionInFlight: String?
    @State private var errorMessage: String?
    @State private var noticeMessage: String?
    @State private var settingsOpen = false
    @State private var settingsSaving = false

    @State private var practiceEnabled = true
    @State private var reviewEnabled = true
    @State private var dailyArticleTarget = 1
    @State private var practiceDurationMinutes = 25
    @State private var practiceAddToTodayPlan = true
    @State private var dailyQuestionTarget = 10
    @State private var reviewScope = "due"
    @State private var reviewDurationMinutes = 25
    @State private var reviewAddToTodayPlan = true

    private var practiceTaskStatus: ERCModuleStatus? {
        configStatus?.practice
    }

    private var reviewTaskStatus: ERCModuleStatus? {
        configStatus?.review
    }

    private var accuracyPercent: Int {
        Int(((overview?.accuracy ?? 0) * 100).rounded())
    }

    private var currentEventName: String? {
        configStatus?.eventName
    }

    private var hasNoPrimaryEvent: Bool {
        [practiceTaskStatus?.state, reviewTaskStatus?.state].contains("no_primary_event")
    }

    private var hasNoConfig: Bool {
        let practiceNeedsConfig = practiceTaskStatus?.enabled != true || practiceTaskStatus?.state == "event_not_configured"
        let reviewNeedsConfig = reviewTaskStatus?.enabled != true || reviewTaskStatus?.state == "event_not_configured"
        return practiceNeedsConfig && reviewNeedsConfig
    }

    private var eventLabel: String {
        if hasNoPrimaryEvent {
            return "计划事件：未绑定"
        }
        if let currentEventName {
            return "计划事件：\(currentEventName)"
        }
        return "计划事件：当前主事件"
    }

    private var syncNotice: String? {
        currentEventName.map { "该配置会同步到当前主事件「\($0)」。" }
    }

    private var noConfigMessage: String {
        if let currentEventName {
            return "当前主事件「\(currentEventName)」尚未配置阅读训练，请通过右上角“配置”完成初始化。"
        }
        return "当前主事件尚未配置阅读训练，请通过右上角“配置”完成初始化。"
    }

    private var isAllCompleted: Bool {
        let practiceCompleted = practiceTaskStatus?.enabled != true || practiceTaskStatus?.state == "completed_today"
        let reviewCompleted = reviewTaskStatus?.enabled != true || reviewTaskStatus?.state == "completed_today"
        let hasEnabledModule = practiceTaskStatus?.enabled == true || reviewTaskStatus?.enabled == true
        return hasEnabledModule && practiceCompleted && reviewCompleted
    }

    private var heroPrimaryActionTitle: String {
        if reviewTaskStatus?.state == "ready" {
            return hasStarted(reviewTaskStatus) ? "继续错题复习" : "开始错题复习"
        }
        if practiceTaskStatus?.state == "ready" {
            return hasStarted(practiceTaskStatus) ? "继续真题练习" : "开始真题练习"
        }
        if isAllCompleted {
            return "今日任务已全部完成"
        }
        return "配置阅读训练"
    }

    private var isHeroPrimaryActionDisabled: Bool {
        if settingsSaving || actionInFlight != nil || isLoading {
            return true
        }
        if reviewTaskStatus?.state == "ready" {
            return reviewTaskStatus?.taskId == nil
        }
        if practiceTaskStatus?.state == "ready" {
            return practiceTaskStatus?.taskId == nil
        }
        return isAllCompleted
    }

    var body: some View {
        VStack(spacing: 0) {
            ERCSubpageSwitcher(selection: $subpage)
                .padding(.horizontal, 32)
                .padding(.top, 18)
                .padding(.bottom, 10)

            Group {
                switch subpage {
                case .overview:
                    ScrollView {
                        VStack(alignment: .leading, spacing: 24) {
                            overviewContent
                        }
                        .frame(maxWidth: 1180)
                        .padding(.horizontal, 32)
                        .padding(.vertical, 18)
                        .frame(maxWidth: .infinity)
                    }
                case .library:
                    ScrollView {
                        VStack(alignment: .leading, spacing: 24) {
                            if let errorMessage {
                                ERCInlineNotice(message: errorMessage, tone: .error)
                            }
                            libraryContent
                        }
                        .frame(maxWidth: 1100)
                        .padding(.horizontal, 32)
                        .padding(.vertical, 22)
                        .frame(maxWidth: .infinity)
                    }
                case .practice:
                    ScrollView {
                        VStack(alignment: .leading, spacing: 24) {
                            if let errorMessage {
                                ERCInlineNotice(message: errorMessage, tone: .error)
                            }
                            practiceContent
                        }
                        .frame(maxWidth: 1180)
                        .padding(.horizontal, 32)
                        .padding(.vertical, 22)
                        .frame(maxWidth: .infinity)
                    }
                case .review:
                    ScrollView {
                        VStack(alignment: .leading, spacing: 24) {
                            if let errorMessage {
                                ERCInlineNotice(message: errorMessage, tone: .error)
                            }
                            reviewContent
                        }
                        .frame(maxWidth: 1180)
                        .padding(.horizontal, 32)
                        .padding(.vertical, 22)
                        .frame(maxWidth: .infinity)
                    }
                case .mistakes:
                    ScrollView {
                        VStack(alignment: .leading, spacing: 24) {
                            if let errorMessage {
                                ERCInlineNotice(message: errorMessage, tone: .error)
                            }
                            mistakesContent
                        }
                        .frame(maxWidth: 1100)
                        .padding(.horizontal, 32)
                        .padding(.vertical, 22)
                        .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .navigationTitle("ERC")
        .overlay {
            if isLoading {
                ProgressView()
                    .padding(28)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
        }
        .sheet(isPresented: $settingsOpen) {
            ERCSettingsSheet(
                eventName: configStatus?.eventName,
                practiceEnabled: $practiceEnabled,
                reviewEnabled: $reviewEnabled,
                dailyArticleTarget: $dailyArticleTarget,
                practiceDurationMinutes: $practiceDurationMinutes,
                practiceAddToTodayPlan: $practiceAddToTodayPlan,
                dailyQuestionTarget: $dailyQuestionTarget,
                reviewScope: $reviewScope,
                reviewDurationMinutes: $reviewDurationMinutes,
                reviewAddToTodayPlan: $reviewAddToTodayPlan,
                isSaving: settingsSaving,
                onCancel: { settingsOpen = false },
                onSave: { Task { await saveSettings() } }
            )
            .presentationDetents([.large])
        }
        .background(ArkTheme.shellBackground.ignoresSafeArea())
        .task {
            await load()
        }
        .onChange(of: subpage) { _, nextSubpage in
            Task { await loadIfNeeded(for: nextSubpage) }
        }
        .onChange(of: activeExam) { _, _ in
            Task { await loadArticles() }
        }
    }

    @ViewBuilder
    private var overviewContent: some View {
        ERCOverviewPage(
            overview: overview,
            statusLabel: eventStatusLabel,
            eventLabel: eventLabel,
            accuracyPercent: accuracyPercent,
            primaryActionTitle: heroPrimaryActionTitle,
            isPrimaryActionDisabled: isHeroPrimaryActionDisabled,
            isBusy: actionInFlight != nil || settingsSaving,
            onConfigure: { settingsOpen = true },
            onRefresh: { Task { await load() } },
            onPrimaryAction: { Task { await handleHeroPrimaryAction() } },
            onOpenLibrary: { subpage = .library },
            onOpenMistakes: { subpage = .mistakes },
            onOpenPractice: { articleId in
                selectedArticleId = articleId
                subpage = .practice
                Task { await loadArticle(articleId) }
            }
        )

        ERCManagedArrangements(
            practice: practiceTaskStatus,
            review: reviewTaskStatus,
            practiceSynced: practiceTaskStatus?.enabled == true ? practiceAddToTodayPlan : false,
            reviewSynced: reviewTaskStatus?.enabled == true ? reviewAddToTodayPlan : false,
            isBusy: actionInFlight != nil || settingsSaving,
            onConfigure: { settingsOpen = true },
            onPracticeSyncToggle: { next in
                Task { await updatePracticeSync(next) }
            },
            onReviewSyncToggle: { next in
                Task { await updateReviewSync(next) }
            },
            onRunPractice: { Task { await runModuleAction(.practice) } },
            onRunReview: { Task { await runModuleAction(.review) } }
        )

        if let errorMessage {
            ERCInlineNotice(message: errorMessage, tone: .error)
        }
        if let noticeMessage {
            ERCInlineNotice(message: noticeMessage, tone: .info)
        }
        if hasNoPrimaryEvent {
            ERCInlineNotice(message: "请先创建或设置主事件，再配置阅读训练。", tone: .info)
        } else if hasNoConfig {
            ERCInlineNotice(message: noConfigMessage, tone: .info)
        } else if let syncNotice {
            ERCInlineNotice(message: syncNotice, tone: .info)
        }
    }

    private var libraryContent: some View {
        ERCLibraryPage(
            sets: sets,
            articles: filteredArticles,
            activeExam: $activeExam,
            selectedArticleId: selectedArticleId,
            onSelect: { article in
                selectedArticleId = article.articleId
                subpage = .practice
                Task { await loadArticle(article.articleId) }
            }
        )
    }

    private var practiceContent: some View {
        ERCPracticePage(
            article: articleDetail,
            answers: practiceAnswers,
            result: practiceResult,
            isLoading: isLoadingArticle,
            isSubmitting: isSubmittingPractice,
            onBackToLibrary: { subpage = .library },
            onSelect: { questionId, option in
                practiceAnswers[questionId] = option
            },
            onSubmit: { Task { await submitPractice() } },
            onContinue: {
                practiceResult = nil
                subpage = .library
                Task { await loadArticles() }
            },
            onReview: { subpage = .review }
        )
    }

    private var reviewContent: some View {
        ERCReviewPage(
            reviewNext: reviewNext,
            selectedOption: selectedReviewOption,
            result: reviewResult,
            isSubmitting: isSubmittingReview,
            onSelect: { option in selectedReviewOption = option },
            onSubmit: { Task { await submitReviewAnswer() } },
            onNext: { Task { await loadReviewNext() } }
        )
    }

    private var mistakesContent: some View {
        ERCMistakesPage(
            items: mistakes,
            onOpenArticle: { articleId in
                selectedArticleId = articleId
                subpage = .practice
                Task { await loadArticle(articleId) }
            }
        )
    }

    private var filteredArticles: [ERCArticleListItem] {
        guard !activeExam.isEmpty else { return articles }
        let setIds = Set(sets.filter { $0.exam == activeExam }.map(\.id))
        return articles.filter { item in
            guard let setId = item.setId else { return false }
            return setIds.contains(setId)
        }
    }

    private var eventStatusLabel: String {
        guard let configStatus else {
            return "计划事件状态读取中"
        }
        if [configStatus.practice.state, configStatus.review.state].contains("no_primary_event") {
            return "未绑定计划事件"
        }
        if [configStatus.practice, configStatus.review].contains(where: { $0.enabled && isConfigured($0) }) {
            return configStatus.eventName.map { "已绑定计划事件：\($0)" } ?? "已绑定计划事件"
        }
        return configStatus.eventName.map { "待配置计划事件：\($0)" } ?? "待配置计划事件"
    }

    private func load() async {
        guard let token = session.token else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            async let overviewResponse: ERCOverview = session.api.get("/api/erc/overview", token: token)
            async let configResponse: ERCConfigStatus = session.api.get("/todo/app-tasks/erc-config", token: token)
            async let setsResponse: [ERCSet] = session.api.get("/api/erc/sets", token: token)
            async let articleResponse: [ERCArticleListItem] = session.api.get("/api/erc/articles", token: token)

            let loadedOverview = try await overviewResponse
            overview = loadedOverview
            configStatus = try await configResponse
            sets = try await setsResponse
            articles = try await articleResponse

            syncSettingsFromConfig()

            if selectedArticleId == nil {
                selectedArticleId = loadedOverview.recommendedArticle?.articleId ?? articles.first?.articleId
            }

            await loadIfNeeded(for: subpage)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadIfNeeded(for page: ERCSubpage) async {
        switch page {
        case .overview:
            break
        case .library:
            if articles.isEmpty {
                await loadArticles()
            }
        case .practice:
            if articleDetail == nil, let articleId = selectedArticleId ?? overview?.recommendedArticle?.articleId ?? articles.first?.articleId {
                selectedArticleId = articleId
                await loadArticle(articleId)
            }
        case .review:
            if reviewNext == nil {
                await loadReviewNext()
            }
        case .mistakes:
            if mistakes.isEmpty {
                await loadMistakes()
            }
        }
    }

    private func loadArticles() async {
        guard let token = session.token else { return }
        errorMessage = nil

        do {
            articles = try await session.api.get("/api/erc/articles", token: token)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadArticle(_ articleId: String) async {
        guard let token = session.token else { return }
        isLoadingArticle = true
        errorMessage = nil
        practiceAnswers = [:]
        practiceResult = nil
        practiceStartedAt = Date()
        defer { isLoadingArticle = false }

        do {
            articleDetail = try await session.api.get("/api/erc/articles/\(articleId)", token: token)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadReviewNext() async {
        guard let token = session.token else { return }
        errorMessage = nil
        selectedReviewOption = nil
        reviewResult = nil

        do {
            reviewNext = try await session.api.get("/api/erc/review/next", token: token)
            reviewStartedAt = Date()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadMistakes() async {
        guard let token = session.token else { return }
        errorMessage = nil

        do {
            mistakes = try await session.api.get("/api/erc/mistakes", token: token)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func submitPractice() async {
        guard let token = session.token, let articleDetail else { return }
        let unanswered = articleDetail.questions.filter { practiceAnswers[$0.questionId] == nil }.count
        guard unanswered == 0 else {
            errorMessage = "还有 \(unanswered) 道题未作答"
            return
        }

        isSubmittingPractice = true
        errorMessage = nil
        defer { isSubmittingPractice = false }

        do {
            let payload = ERCArticleSubmitPayload(
                answers: articleDetail.questions.compactMap { question in
                    guard let option = practiceAnswers[question.questionId] else { return nil }
                    return ERCPracticeAnswer(questionId: question.questionId, chosenOption: option)
                },
                timeSpentMs: max(0, Int(Date().timeIntervalSince(practiceStartedAt) * 1000))
            )
            practiceResult = try await session.api.post("/api/erc/articles/\(articleDetail.articleId)/submit", token: token, body: payload)
            await refreshOverviewOnly()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func submitReviewAnswer() async {
        guard let token = session.token, let question = reviewNext?.question, let selectedReviewOption else { return }
        isSubmittingReview = true
        errorMessage = nil
        defer { isSubmittingReview = false }

        do {
            let payload = ERCReviewSubmitPayload(
                questionId: question.questionId,
                chosenOption: selectedReviewOption,
                timeSpentMs: max(0, Int(Date().timeIntervalSince(reviewStartedAt) * 1000))
            )
            reviewResult = try await session.api.post("/api/erc/review/submit", token: token, body: payload)
            await refreshOverviewOnly()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func runModuleAction(_ module: ERCModuleKind) async {
        guard let token = session.token else { return }
        let moduleStatus = module == .practice ? configStatus?.practice : configStatus?.review
        actionInFlight = module.rawValue
        errorMessage = nil
        defer { actionInFlight = nil }

        do {
            if moduleStatus?.state == "ready", let taskId = moduleStatus?.taskId {
                let _: EmptyResponse = try await session.api.post("/todo/tasks/\(taskId)/focus/start", token: token)
            } else {
                switch module {
                case .practice:
                    _ = try await persistConfig(token: token, practiceEnabled: true)
                case .review:
                    _ = try await persistConfig(token: token, reviewEnabled: true)
                }
            }
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func saveSettings() async {
        guard let token = session.token else { return }
        settingsSaving = true
        errorMessage = nil
        defer { settingsSaving = false }

        do {
            _ = try await persistConfig(token: token)
            settingsOpen = false
            await refreshOverviewOnly()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func persistConfig(
        token: String,
        practiceEnabled: Bool? = nil,
        reviewEnabled: Bool? = nil,
        practiceAddToTodayPlan: Bool? = nil,
        reviewAddToTodayPlan: Bool? = nil
    ) async throws -> ERCConfigStatus {
        let payload = ERCConfigSavePayload(
            eventId: configStatus?.eventId,
            practiceEnabled: practiceEnabled ?? self.practiceEnabled,
            reviewEnabled: reviewEnabled ?? self.reviewEnabled,
            practice: ERCPracticeConfigPayload(
                dailyArticleTarget: max(1, dailyArticleTarget),
                defaultFocusDuration: max(5, practiceDurationMinutes) * 60,
                addToTodayPlan: practiceAddToTodayPlan ?? self.practiceAddToTodayPlan
            ),
            review: ERCReviewConfigPayload(
                reviewScope: reviewScope,
                dailyQuestionTarget: max(1, dailyQuestionTarget),
                defaultFocusDuration: max(5, reviewDurationMinutes) * 60,
                addToTodayPlan: reviewAddToTodayPlan ?? self.reviewAddToTodayPlan
            )
        )
        let response: ERCConfigStatus = try await session.api.post("/todo/app-tasks/erc-config", token: token, body: payload)
        configStatus = response
        syncSettingsFromConfig()
        noticeMessage = confirmationNotice(from: response)
        return response
    }

    private func refreshOverviewOnly() async {
        guard let token = session.token else { return }
        overview = try? await session.api.get("/api/erc/overview", token: token)
        configStatus = try? await session.api.get("/todo/app-tasks/erc-config", token: token)
        syncSettingsFromConfig()
    }

    private func syncSettingsFromConfig() {
        guard let configStatus else { return }
        practiceEnabled = configStatus.practice.enabled
        reviewEnabled = configStatus.review.enabled
        dailyArticleTarget = configStatus.practice.config["daily_article_target"]?.intValue ?? 1
        practiceDurationMinutes = max(5, (configStatus.practice.config["default_focus_duration"]?.intValue ?? 1500) / 60)
        practiceAddToTodayPlan = configStatus.practice.config["add_to_today_plan"]?.boolValue ?? true
        dailyQuestionTarget = configStatus.review.config["daily_question_target"]?.intValue ?? 10
        reviewScope = configStatus.review.config["review_scope"]?.stringValue ?? "due"
        reviewDurationMinutes = max(5, (configStatus.review.config["default_focus_duration"]?.intValue ?? 1500) / 60)
        reviewAddToTodayPlan = configStatus.review.config["add_to_today_plan"]?.boolValue ?? true
    }

    private func handleHeroPrimaryAction() async {
        if reviewTaskStatus?.state == "ready" {
            await runModuleAction(.review)
            return
        }
        if practiceTaskStatus?.state == "ready" {
            await runModuleAction(.practice)
            return
        }
        settingsOpen = true
    }

    private func updatePracticeSync(_ nextValue: Bool) async {
        guard let token = session.token else { return }
        practiceAddToTodayPlan = nextValue
        do {
            _ = try await persistConfig(token: token, practiceAddToTodayPlan: nextValue)
            await refreshOverviewOnly()
        } catch {
            practiceAddToTodayPlan.toggle()
            errorMessage = error.localizedDescription
        }
    }

    private func updateReviewSync(_ nextValue: Bool) async {
        guard let token = session.token else { return }
        reviewAddToTodayPlan = nextValue
        do {
            _ = try await persistConfig(token: token, reviewAddToTodayPlan: nextValue)
            await refreshOverviewOnly()
        } catch {
            reviewAddToTodayPlan.toggle()
            errorMessage = error.localizedDescription
        }
    }

    private func hasStarted(_ module: ERCModuleStatus?) -> Bool {
        (module?.completionState?.completedCountInPeriod ?? 0) > 0
    }

    private func confirmationNotice(from configStatus: ERCConfigStatus) -> String? {
        let modules = [
            configStatus.practice.confirmationNeeded ? "真题练习" : nil,
            configStatus.review.confirmationNeeded ? "错题复习" : nil,
        ]
        .compactMap { $0 }

        guard !modules.isEmpty else { return nil }
        return "检测到\(modules.joined(separator: "、"))已有手动今日安排，系统已保留该安排。"
    }
}

private enum ERCSubpage: String, CaseIterable, Identifiable {
    case overview
    case library
    case practice
    case review
    case mistakes

    var id: String { rawValue }

    var title: String {
        switch self {
        case .overview: "概览"
        case .library: "题库"
        case .practice: "真题练习"
        case .review: "错题复习"
        case .mistakes: "错题本"
        }
    }

    var symbol: String {
        switch self {
        case .overview: "chart.pie"
        case .library: "books.vertical"
        case .practice: "doc.text.magnifyingglass"
        case .review: "arrow.triangle.2.circlepath"
        case .mistakes: "tray.full"
        }
    }
}

private enum ERCModuleKind: String {
    case practice
    case review
}

private struct ERCSubpageSwitcher: View {
    @Binding var selection: ERCSubpage

    var body: some View {
        SubAppTabSwitcher(
            selection: $selection,
            tabs: ERCSubpage.allCases.map { page in
                SubAppTabDescriptor(id: page, title: page.title, symbol: page.symbol)
            }
        )
    }
}

private struct ERCOverviewPage: View {
    let overview: ERCOverview?
    let statusLabel: String
    let eventLabel: String
    let accuracyPercent: Int
    let primaryActionTitle: String
    let isPrimaryActionDisabled: Bool
    let isBusy: Bool
    let onConfigure: () -> Void
    let onRefresh: () -> Void
    let onPrimaryAction: () -> Void
    let onOpenLibrary: () -> Void
    let onOpenMistakes: () -> Void
    let onOpenPractice: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            SubAppHeroCard(
                eyebrow: "ERC",
                title: "阅读训练",
                statusLabel: statusLabel,
                metaItems: [eventLabel, "托管任务：真题练习 / 错题复习"],
                progressPercent: accuracyPercent,
                progressLabel: "历史正确率",
                heroEyebrow: "TODAY WORKSPACE",
                heroLabel: "今日优先任务",
                heroValue: "\(overview?.dueReviewCount ?? 0) 道",
                heroDetail: "先处理到期错题，再进入真题练习。",
                primaryActionTitle: primaryActionTitle,
                isPrimaryActionDisabled: isPrimaryActionDisabled,
                isActing: isBusy,
                metrics: [
                    SubAppMetricItem(label: "今日待复习", value: "\(overview?.dueReviewCount ?? 0)", detail: "DUE"),
                    SubAppMetricItem(label: "已练文章", value: "\(overview?.practicedArticleCount ?? 0)", detail: "ARTICLES"),
                    SubAppMetricItem(label: "正确率", value: "\(accuracyPercent)%", detail: "ACCURACY"),
                    SubAppMetricItem(label: "错题", value: "\(overview?.mistakeCount ?? 0)", detail: "MISTAKES"),
                ],
                toolbar: {
                    HStack(spacing: 10) {
                        Button(action: onRefresh) {
                            Label("刷新", systemImage: "arrow.clockwise")
                        }
                        .buttonStyle(.bordered)

                        Button(action: onConfigure) {
                            Label("配置", systemImage: "gearshape")
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.white)
                        .foregroundStyle(.primary)
                    }
                },
                onPrimaryAction: onPrimaryAction
            )

            VStack(alignment: .leading, spacing: 16) {
                SubAppSectionHeading(
                    eyebrow: "LEARNING ASSETS",
                    title: "长期积累",
                    description: "题库进度、错题资产和推荐练习都集中在这里。"
                )

                HStack(alignment: .top, spacing: 16) {
                    Button(action: onOpenLibrary) {
                        ERCAssetCard(
                            title: "题库进度",
                            value: "\(overview?.practicedArticleCount ?? 0) 篇文章",
                            detail: "已练 \(overview?.practicedQuestionCount ?? 0) 道题",
                            actionTitle: "进入题库",
                            symbol: "books.vertical"
                        )
                    }
                    .buttonStyle(.plain)

                    Button(action: onOpenMistakes) {
                        ERCAssetCard(
                            title: "错题资产",
                            value: "\(overview?.mistakeCount ?? 0) 道错题",
                            detail: "今日到期 \(overview?.dueReviewCount ?? 0) 道",
                            actionTitle: "查看错题",
                            symbol: "arrow.triangle.2.circlepath"
                        )
                    }
                    .buttonStyle(.plain)
                }

                if let article = overview?.recommendedArticle {
                    Button {
                        onOpenPractice(article.articleId)
                    } label: {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("今日推荐练习")
                                .font(.callout)
                                .foregroundStyle(.secondary)
                            Text("\(article.year) 年 Text \(article.textNo)")
                                .font(.title2.weight(.bold))
                            Text(article.title.isEmpty ? "无标题文章" : article.title)
                                .font(.callout)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(20)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct ERCLibraryPage: View {
    let sets: [ERCSet]
    let articles: [ERCArticleListItem]
    @Binding var activeExam: String
    let selectedArticleId: String?
    let onSelect: (ERCArticleListItem) -> Void

    private var examOptions: [String] {
        Array(Set(sets.map(\.exam).filter { !$0.isEmpty })).sorted()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 8) {
                    SectionEyebrow("LIBRARY")
                    Text("阅读题库")
                        .font(.largeTitle.weight(.heavy))
                }
                Spacer()
                Text("\(articles.count) 篇")
                    .font(.headline)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 10) {
                FilterChip(title: "全部", isSelected: activeExam.isEmpty) {
                    activeExam = ""
                }
                ForEach(examOptions, id: \.self) { exam in
                    FilterChip(title: exam, isSelected: activeExam == exam) {
                        activeExam = exam
                    }
                }
            }

            if articles.isEmpty {
                ContentUnavailableView("暂无文章", systemImage: "doc.text", description: Text("当前筛选下没有阅读文章。"))
                    .frame(maxWidth: .infinity, minHeight: 340)
                    .arkCard()
            } else {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 16), count: 2), spacing: 16) {
                    ForEach(articles) { article in
                        Button {
                            onSelect(article)
                        } label: {
                            VStack(alignment: .leading, spacing: 12) {
                                HStack {
                                    Text("\(article.year) Text \(article.textNo)")
                                        .font(.title3.weight(.bold))
                                    Spacer()
                                    Text(article.statusLabel)
                                        .font(.caption.weight(.semibold))
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 6)
                                        .background(article.statusTint.opacity(0.16), in: Capsule())
                                        .foregroundStyle(article.statusTint)
                                }

                                Text(article.title.isEmpty ? "无标题文章" : article.title)
                                    .font(.callout)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)

                                HStack(spacing: 14) {
                                    Label("\(article.questionCount ?? 0) 题", systemImage: "checklist")
                                    Label("错题 \(article.mistakeCount ?? 0)", systemImage: "exclamationmark.circle")
                                }
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, minHeight: 128, alignment: .topLeading)
                            .padding(18)
                            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .stroke(selectedArticleId == article.articleId ? ArkTheme.accent : Color.clear, lineWidth: 2)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}

private struct ERCPracticePage: View {
    let article: ERCArticleDetail?
    let answers: [String: String]
    let result: ERCArticleSubmitResult?
    let isLoading: Bool
    let isSubmitting: Bool
    let onBackToLibrary: () -> Void
    let onSelect: (String, String) -> Void
    let onSubmit: () -> Void
    let onContinue: () -> Void
    let onReview: () -> Void

    private let optionKeys = ["A", "B", "C", "D"]

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 8) {
                    SectionEyebrow("PRACTICE")
                    Text(article.map { "\($0.year) Text \($0.textNo)" } ?? "整篇练习")
                        .font(.largeTitle.weight(.heavy))
                }
                Spacer()
                Button("返回题库", action: onBackToLibrary)
                    .buttonStyle(.bordered)
            }

            if isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 460)
                    .arkCard()
            } else if let result {
                ERCPracticeResultView(result: result, onReview: onReview, onContinue: onContinue)
            } else if let article {
                HStack(alignment: .top, spacing: 18) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 18) {
                            ForEach(article.paragraphs) { paragraph in
                                HStack(alignment: .top, spacing: 14) {
                                    Text("\(paragraph.paragraphNo)")
                                        .font(.caption.weight(.bold))
                                        .foregroundStyle(.secondary)
                                        .frame(width: 28, alignment: .trailing)
                                    Text(paragraph.text)
                                        .font(.body)
                                        .lineSpacing(6)
                                }
                            }
                        }
                        .padding(4)
                    }
                    .frame(minHeight: 560, maxHeight: 720)
                    .padding(22)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            if let vocab = article.vocabularySummary, vocab.totalWordCount > 0 {
                                ERCVocabularySummaryCard(vocabulary: vocab)
                            }

                            ForEach(article.questions) { question in
                                VStack(alignment: .leading, spacing: 12) {
                                    Text("\(question.questionNo). \(question.stem)")
                                        .font(.headline)
                                        .lineSpacing(3)

                                    ForEach(optionKeys, id: \.self) { key in
                                        if let option = question.options[key] {
                                            Button {
                                                onSelect(question.questionId, key)
                                            } label: {
                                                HStack(alignment: .top, spacing: 10) {
                                                    Text(key)
                                                        .font(.headline)
                                                        .frame(width: 30, height: 30)
                                                        .background(answers[question.questionId] == key ? ArkTheme.accent : Color.secondary, in: Circle())
                                                        .foregroundStyle(.white)
                                                    Text(option)
                                                        .font(.callout)
                                                        .multilineTextAlignment(.leading)
                                                    Spacer(minLength: 0)
                                                }
                                                .frame(maxWidth: .infinity, alignment: .topLeading)
                                            }
                                            .buttonStyle(.bordered)
                                            .tint(answers[question.questionId] == key ? ArkTheme.accent : .secondary)
                                        }
                                    }
                                }
                                .padding(16)
                                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            }

                            Button {
                                onSubmit()
                            } label: {
                                if isSubmitting {
                                    ProgressView()
                                } else {
                                    Label("提交整篇", systemImage: "paperplane.fill")
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.large)
                            .frame(maxWidth: .infinity)
                            .disabled(isSubmitting)
                        }
                    }
                    .frame(width: 470)
                    .frame(minHeight: 560, maxHeight: 720)
                }
            } else {
                ContentUnavailableView("等待文章", systemImage: "doc.text.magnifyingglass", description: Text("请先从题库选择一篇文章。"))
                    .frame(maxWidth: .infinity, minHeight: 420)
                    .arkCard()
            }
        }
    }
}

private struct ERCReviewPage: View {
    let reviewNext: ERCReviewNext?
    let selectedOption: String?
    let result: ERCReviewSubmitResult?
    let isSubmitting: Bool
    let onSelect: (String) -> Void
    let onSubmit: () -> Void
    let onNext: () -> Void

    private let optionKeys = ["A", "B", "C", "D"]

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 8) {
                    SectionEyebrow("ERC REVIEW")
                    Text("错题复习")
                        .font(.largeTitle.weight(.heavy))
                }
                Spacer()
                Button {
                    onNext()
                } label: {
                    Label("刷新", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
            }

            if let reviewNext, reviewNext.hasItem, let question = reviewNext.question {
                HStack(alignment: .top, spacing: 18) {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Reading Passage")
                            .font(.title2.weight(.bold))
                        ScrollView {
                            VStack(alignment: .leading, spacing: 14) {
                                ForEach(reviewNext.paragraphs) { paragraph in
                                    HStack(alignment: .top, spacing: 12) {
                                        Text("\(paragraph.paragraphNo)")
                                            .font(.caption.weight(.bold))
                                            .foregroundStyle(.secondary)
                                            .frame(width: 28, alignment: .trailing)
                                        Text(paragraph.text)
                                            .font(.callout)
                                            .lineSpacing(5)
                                    }
                                }
                            }
                        }
                        .frame(maxHeight: 580)
                    }
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                    .arkCard()

                    VStack(alignment: .leading, spacing: 16) {
                        Text("Current Question")
                            .font(.title2.weight(.bold))
                        Text("\(question.questionNo). \(question.stem)")
                            .font(.title3.weight(.semibold))
                            .lineSpacing(4)

                        ForEach(optionKeys, id: \.self) { key in
                            if let option = question.options[key] {
                                Button {
                                    onSelect(key)
                                } label: {
                                    HStack(alignment: .top, spacing: 10) {
                                        Text(key)
                                            .font(.headline)
                                            .frame(width: 30, height: 30)
                                            .background(optionBadgeColor(key), in: Circle())
                                            .foregroundStyle(.white)
                                        Text(option)
                                            .font(.callout)
                                            .multilineTextAlignment(.leading)
                                        Spacer(minLength: 0)
                                    }
                                }
                                .buttonStyle(.bordered)
                                .tint(optionTint(key))
                                .disabled(result != nil)
                            }
                        }

                        HStack {
                            if let result {
                                Label(result.isCorrect ? "答对了" : "正确答案 \(result.correctOption)", systemImage: result.isCorrect ? "checkmark.circle.fill" : "xmark.circle.fill")
                                    .font(.headline)
                                    .foregroundStyle(result.isCorrect ? ArkTheme.success : .red)
                            }

                            Spacer()

                            Button {
                                result == nil ? onSubmit() : onNext()
                            } label: {
                                if isSubmitting {
                                    ProgressView()
                                } else {
                                    Label(result == nil ? "提交答案" : "下一题", systemImage: result == nil ? "paperplane" : "chevron.right")
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.large)
                            .disabled((result == nil && selectedOption == nil) || isSubmitting)
                        }
                    }
                    .frame(width: 510, alignment: .topLeading)
                    .arkCard()
                }
            } else if reviewNext?.hasItem == false {
                ContentUnavailableView("暂无到期复习", systemImage: "checkmark.seal", description: Text("当前没有到期错题，可以稍后再回来。"))
                    .frame(maxWidth: .infinity, minHeight: 420)
                    .arkCard()
            } else {
                ContentUnavailableView("正在读取复习题", systemImage: "doc.text.magnifyingglass")
                    .frame(maxWidth: .infinity, minHeight: 420)
                    .arkCard()
            }
        }
    }

    private func optionTint(_ key: String) -> Color {
        if let result {
            if result.correctOption == key { return ArkTheme.success }
            if selectedOption == key { return .red }
            return .secondary
        }
        return selectedOption == key ? ArkTheme.accent : .secondary
    }

    private func optionBadgeColor(_ key: String) -> Color {
        if let result {
            if result.correctOption == key { return ArkTheme.success }
            if selectedOption == key { return .red }
            return .secondary
        }
        return selectedOption == key ? ArkTheme.accent : .secondary
    }
}

private struct ERCMistakesPage: View {
    let items: [ERCMistakeItem]
    let onOpenArticle: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            SectionEyebrow("MISTAKES")
            Text("错题本")
                .font(.largeTitle.weight(.heavy))

            if items.isEmpty {
                ContentUnavailableView("暂无错题", systemImage: "checkmark.seal", description: Text("错题会在完成整篇练习后进入这里。"))
                    .frame(maxWidth: .infinity, minHeight: 420)
                    .arkCard()
            } else {
                VStack(spacing: 14) {
                    ForEach(items) { item in
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                Text("\(item.year) Text \(item.textNo) · \(item.questionNo)")
                                    .font(.headline)
                                    .foregroundStyle(.secondary)
                                Spacer()
                                Text(item.isDue ? "到期" : "未到期")
                                    .font(.caption.weight(.semibold))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background((item.isDue ? ArkTheme.warning : Color.secondary).opacity(0.15), in: Capsule())
                            }

                            Text(item.stem)
                                .font(.title3.weight(.semibold))

                            Text("正确答案 \(item.correctOption)\(item.lastChosenOption.map { " · 最近选择 \($0)" } ?? "") · 错误 \(item.wrongCount) 次")
                                .font(.callout)
                                .foregroundStyle(.secondary)

                            Button {
                                onOpenArticle(item.articleId)
                            } label: {
                                Label("回到原文", systemImage: "doc.text.magnifyingglass")
                            }
                            .buttonStyle(.bordered)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(18)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                }
                .arkCard()
            }
        }
    }
}

private struct ERCInlineNotice: View {
    enum Tone {
        case info
        case error

        var tint: Color {
            switch self {
            case .info: ArkTheme.warning
            case .error: .red
            }
        }
    }

    let message: String
    let tone: Tone

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: tone == .info ? "sparkles" : "exclamationmark.triangle.fill")
                .font(.headline)
                .foregroundStyle(tone.tint)
            Text(message)
                .font(.callout)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(tone.tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(tone.tint.opacity(0.18), lineWidth: 1)
        }
    }
}

private struct ERCSettingsSheet: View {
    let eventName: String?
    @Binding var practiceEnabled: Bool
    @Binding var reviewEnabled: Bool
    @Binding var dailyArticleTarget: Int
    @Binding var practiceDurationMinutes: Int
    @Binding var practiceAddToTodayPlan: Bool
    @Binding var dailyQuestionTarget: Int
    @Binding var reviewScope: String
    @Binding var reviewDurationMinutes: Int
    @Binding var reviewAddToTodayPlan: Bool
    let isSaving: Bool
    let onCancel: () -> Void
    let onSave: () -> Void

    var body: some View {
        SubAppSettingsFormScreen(
            title: "配置阅读训练",
            isSaving: isSaving,
            onCancel: onCancel,
            onSave: onSave
        ) {
            Section("计划事件") {
                Text(eventName ?? "当前主事件")
                    .foregroundStyle(.secondary)
            }

            Section("真题练习") {
                Toggle("启用", isOn: $practiceEnabled)
                Group {
                    Stepper("每日目标 \(dailyArticleTarget) 篇", value: $dailyArticleTarget, in: 1...10)
                    Stepper("默认专注 \(practiceDurationMinutes) 分钟", value: $practiceDurationMinutes, in: 5...120, step: 5)
                    Toggle("同步到今日安排", isOn: $practiceAddToTodayPlan)
                }
                .disabled(!practiceEnabled)
            }

            Section("错题复习") {
                Toggle("启用", isOn: $reviewEnabled)
                Group {
                    Picker("复习范围", selection: $reviewScope) {
                        Text("仅到期错题").tag("due")
                        Text("未掌握错题").tag("mistakes")
                        Text("全部做错题目").tag("all")
                    }
                    Stepper("每日目标 \(dailyQuestionTarget) 题", value: $dailyQuestionTarget, in: 1...100)
                    Stepper("默认专注 \(reviewDurationMinutes) 分钟", value: $reviewDurationMinutes, in: 5...120, step: 5)
                    Toggle("同步到今日安排", isOn: $reviewAddToTodayPlan)
                }
                .disabled(!reviewEnabled)
            }
        }
    }
}

private struct ERCManagedArrangements: View {
    let practice: ERCModuleStatus?
    let review: ERCModuleStatus?
    let practiceSynced: Bool
    let reviewSynced: Bool
    let isBusy: Bool
    let onConfigure: () -> Void
    let onPracticeSyncToggle: (Bool) -> Void
    let onReviewSyncToggle: (Bool) -> Void
    let onRunPractice: () -> Void
    let onRunReview: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SubAppSectionHeading(eyebrow: "MANAGED ARRANGEMENTS", title: "托管安排", description: nil, accent: ArkTheme.warning)

            HStack(alignment: .top, spacing: 16) {
                ERCManagedTaskRow(
                    title: "真题练习",
                    focusWorkName: "真题练习",
                    module: practice,
                    symbol: "doc.text.magnifyingglass",
                    isSynced: practiceSynced,
                    isBusy: isBusy,
                    onConfigure: onConfigure,
                    onSyncToggle: onPracticeSyncToggle,
                    onRun: onRunPractice
                )

                ERCManagedTaskRow(
                    title: "错题复习",
                    focusWorkName: "错题复习",
                    module: review,
                    symbol: "arrow.triangle.2.circlepath",
                    isSynced: reviewSynced,
                    isBusy: isBusy,
                    onConfigure: onConfigure,
                    onSyncToggle: onReviewSyncToggle,
                    onRun: onRunReview
                )
            }

            HStack(alignment: .top, spacing: 16) {
                SubAppScheduleCard(
                    accent: ArkTheme.warning,
                    title: "日程",
                    emptyTitle: "暂无日程安排",
                    emptyDetail: "当前子应用尚未生成托管日程"
                )
                Spacer(minLength: 0)
            }
        }
        .padding(20)
        .subAppGlassCard(cornerRadius: 12)
    }
}

private struct ERCManagedTaskRow: View {
    let title: String
    let focusWorkName: String
    let module: ERCModuleStatus?
    let symbol: String
    let isSynced: Bool
    let isBusy: Bool
    let onConfigure: () -> Void
    let onSyncToggle: (Bool) -> Void
    let onRun: () -> Void

    var body: some View {
        SubAppManagedTaskCard(
            accent: ArkTheme.warning,
            title: title,
            symbol: symbol,
            statusText: subAppManagedStatusText(
                state: module?.state,
                enabled: module?.enabled ?? false
            ),
            statusTint: subAppManagedDisplayState(
                state: module?.state,
                enabled: module?.enabled ?? false
            ).tint,
            focusWorkName: focusWorkName,
            disabledReason: subAppDisabledReason(
                state: module?.state,
                blockedReason: module?.blockedReason
            ),
            syncLabel: "同步到今日安排",
            isSynced: isSynced,
            isSyncEnabled: module?.enabled == true && isConfigured(module) && !isBusy,
            primaryActionTitle: primaryActionTitle,
            primaryActionSymbol: primaryActionTitle == "初始化" ? "wand.and.stars" : "play.fill",
            isPrimaryActionDisabled: primaryActionDisabled,
            showPrimaryProgress: isBusy,
            onSyncToggle: onSyncToggle,
            onPrimaryAction: primaryActionTitle == nil ? nil : onRun,
            onConfigure: onConfigure
        )
    }

    private var primaryActionTitle: String? {
        guard let module else { return nil }
        if module.state == "no_primary_event" || !module.enabled || module.state == "event_not_configured" || module.state == "config_invalid" || module.state == "completed_today" || module.state == "blocked" {
            return nil
        }
        if module.state == "uninitialized" {
            return "初始化"
        }
        return (module.completionState?.completedCountInPeriod ?? 0) > 0 ? "继续" : "开始"
    }

    private var primaryActionDisabled: Bool {
        isBusy || primaryActionTitle == nil
    }
}

private struct ERCAssetCard: View {
    let title: String
    let value: String
    let detail: String
    let actionTitle: String
    let symbol: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(title)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    Text(value)
                        .font(.title.weight(.bold))
                }
                Spacer()
                Image(systemName: symbol)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(ArkTheme.accent)
            }
            Text(detail)
                .font(.callout)
                .foregroundStyle(.secondary)
            Text(actionTitle)
                .font(.callout.weight(.semibold))
                .foregroundStyle(ArkTheme.accent)
        }
        .frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
        .padding(20)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(.white.opacity(0.42), lineWidth: 1)
        }
    }
}

private struct ERCVocabularySummaryCard: View {
    let vocabulary: ERCArticleVocabularySummary

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("阅读前词汇预热")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    Text("\(Int((vocabulary.masteryRate * 100).rounded()))%")
                        .font(.title.weight(.bold))
                }
                Spacer()
                Text("预计生词 \(vocabulary.unfamiliarCount) / \(vocabulary.totalWordCount)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if !vocabulary.previewWords.isEmpty {
                FlowLayout(spacing: 8) {
                    ForEach(vocabulary.previewWords.prefix(8)) { word in
                        Text("\(word.word) · \(vocabStateLabel(word.state))")
                            .font(.caption)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(.thinMaterial, in: Capsule())
                    }
                }
            }
        }
        .padding(16)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private struct ERCPracticeResultView: View {
    let result: ERCArticleSubmitResult
    let onReview: () -> Void
    let onContinue: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            SectionEyebrow("RESULT")
            Text("练习结果")
                .font(.largeTitle.weight(.heavy))
            Text("\(result.correctCount) / \(result.questionCount)")
                .font(.system(size: 56, weight: .heavy, design: .rounded))

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 2), spacing: 12) {
                ForEach(result.items) { item in
                    HStack {
                        Text("\(item.questionNo)")
                            .font(.headline)
                        Spacer()
                        Text(item.isCorrect ? "正确" : "错误")
                            .font(.callout.weight(.semibold))
                            .foregroundStyle(item.isCorrect ? ArkTheme.success : .red)
                    }
                    .padding(16)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            }

            HStack {
                Button("进入复习池", action: onReview)
                    .buttonStyle(.borderedProminent)
                Button("继续练习", action: onContinue)
                    .buttonStyle(.bordered)
            }
        }
        .arkCard()
    }
}

private struct FilterChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(title, action: action)
            .buttonStyle(.bordered)
            .tint(isSelected ? ArkTheme.accent : .secondary)
    }
}

private struct SectionEyebrow: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(ArkTheme.accent)
            .tracking(5)
    }
}

private struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? 320
        var size = CGSize.zero
        var lineWidth: CGFloat = 0
        var lineHeight: CGFloat = 0

        for subview in subviews {
            let subviewSize = subview.sizeThatFits(.unspecified)
            if lineWidth > 0, lineWidth + spacing + subviewSize.width > maxWidth {
                size.width = max(size.width, lineWidth)
                size.height += lineHeight + spacing
                lineWidth = 0
                lineHeight = 0
            }
            lineWidth += (lineWidth > 0 ? spacing : 0) + subviewSize.width
            lineHeight = max(lineHeight, subviewSize.height)
        }

        size.width = max(size.width, lineWidth)
        size.height += lineHeight
        return size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var point = bounds.origin
        var lineHeight: CGFloat = 0

        for subview in subviews {
            let subviewSize = subview.sizeThatFits(.unspecified)
            if point.x > bounds.minX, point.x + subviewSize.width > bounds.maxX {
                point.x = bounds.minX
                point.y += lineHeight + spacing
                lineHeight = 0
            }
            subview.place(at: point, proposal: ProposedViewSize(subviewSize))
            point.x += subviewSize.width + spacing
            lineHeight = max(lineHeight, subviewSize.height)
        }
    }
}

private func isConfigured(_ module: ERCModuleStatus) -> Bool {
    module.enabled && !["no_primary_event", "event_not_configured", "uninitialized", "config_invalid"].contains(module.state)
}

private func isConfigured(_ module: ERCModuleStatus?) -> Bool {
    guard let module else { return false }
    return isConfigured(module)
}

private func vocabStateLabel(_ state: String) -> String {
    switch state {
    case "mastered": return "已掌握"
    case "learning": return "学习中"
    case "unstarted": return "未学"
    case "unknown": return "词库外"
    default: return state
    }
}

private extension ERCArticleListItem {
    var statusLabel: String {
        switch status {
        case "practiced": "已练"
        case "has_due_review": "待复习"
        case "unstarted": "未练"
        default: "未知"
        }
    }

    var statusTint: Color {
        switch status {
        case "practiced": ArkTheme.success
        case "has_due_review": ArkTheme.warning
        default: .secondary
        }
    }
}
