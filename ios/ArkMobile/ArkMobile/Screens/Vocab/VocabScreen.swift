import SwiftUI

struct VocabScreen: View {
    @EnvironmentObject private var session: AppSession
    @State private var decks: [VocabDeck] = []
    @State private var appTaskStatus: AppTaskStatus?
    @State private var todaySummary: VocabTodaySummary?
    @State private var overview: VocabOverview?
    @State private var selectedDeckId: String?
    @State private var selectedMode: VocabStudyMode = .today
    @State private var learningQueue: [VocabReviewItem] = []
    @State private var reviewQueue: [VocabReviewItem] = []
    @State private var studyQueue: [VocabReviewItem] = []
    @State private var extraQueue: [VocabReviewItem] = []
    @State private var extraIndex = 0
    @State private var isExtraPractice = false
    @State private var isLoadingExtra = false
    @State private var revealed = false
    @State private var lastResult: VocabReviewSubmitResult?
    @State private var cardStartedAt = Date()
    @State private var isLoading = false
    @State private var isActing = false
    @State private var isSubmitting = false
    @State private var isSettingsPresented = false
    @State private var isSavingSettings = false
    @State private var settingsTargetCount = 20
    @State private var settingsFocusMinutes = 25
    @State private var errorMessage: String?
    @State private var activeSubpage: VocabSubpage = .overview
    @State private var mistakeItems: [VocabMistakeItem] = []
    @State private var loadedMistakesDeckId: String?
    @State private var isLoadingMistakes = false
    @State private var mistakesError: String?
    @State private var selectedWordDetail: VocabWordDetail?

    private var primaryDeck: VocabDeck? {
        decks.first { $0.id == selectedDeckId } ?? decks.first
    }

    private var mistakesLoadKey: String {
        "\(activeSubpage.rawValue)-\(selectedDeckId ?? "none")"
    }

    private var progressPercent: Int {
        guard let todaySummary, todaySummary.totalCount > 0 else { return 0 }
        return min(100, Int((Double(todaySummary.completedCount) / Double(todaySummary.totalCount) * 100).rounded()))
    }

    private var isTodayComplete: Bool {
        guard let todaySummary else { return false }
        return todaySummary.totalCount > 0 && todaySummary.pendingCount == 0
    }

    private var hasEventAppConfig: Bool {
        subAppHasManagedConfig(appTaskStatus?.state)
    }

    private var eventStatusText: String {
        subAppEventStatusText(state: appTaskStatus?.state, hasManagedConfig: hasEventAppConfig)
    }

    private var eventLabel: String {
        subAppEventLabel(state: appTaskStatus?.state, eventName: appTaskStatus?.eventName)
    }

    private var primaryActionTitle: String {
        let completedOrDone = appTaskStatus?.state == "completed_today" || isTodayComplete
        switch appTaskStatus?.state {
        case "ready":
            return (todaySummary?.completedCount ?? 0) > 0 ? "继续今日单词" : "开始今日单词"
        case "uninitialized":
            return "初始化今日单词"
        case "event_not_configured", "config_invalid":
            return "调整今日单词"
        default:
            return completedOrDone ? "调整今日单词" : "不可用"
        }
    }

    private var arrangementActionTitle: String {
        let completedOrDone = appTaskStatus?.state == "completed_today" || isTodayComplete
        switch appTaskStatus?.state {
        case "ready":
            return (todaySummary?.completedCount ?? 0) > 0 ? "继续" : "开始"
        case "uninitialized":
            return "初始化"
        case "event_not_configured", "config_invalid":
            return "配置"
        default:
            return completedOrDone ? "配置" : "不可用"
        }
    }

    private var appTaskDisabledReason: String? {
        subAppDisabledReason(state: appTaskStatus?.state, blockedReason: appTaskStatus?.blockedReason)
    }

    private var isPrimaryActionDisabled: Bool {
        if isActing || isLoading || isSavingSettings { return true }
        let completedOrDone = appTaskStatus?.state == "completed_today" || isTodayComplete
        if completedOrDone { return primaryDeck == nil }
        switch appTaskStatus?.state {
        case "ready":
            return appTaskStatus?.taskId == nil
        case "uninitialized", "event_not_configured", "config_invalid":
            return primaryDeck == nil
        default:
            return true
        }
    }

    private var modalInitialTarget: Int {
        guard let todaySummary else { return 20 }
        return isTodayComplete ? todaySummary.totalCount + todaySummary.dailyTargetCount : todaySummary.dailyTargetCount
    }

    private var currentDeckMasteryPercent: Int {
        guard let currentDeck = overview?.currentDeck, currentDeck.totalWordCount > 0 else { return 0 }
        return min(100, Int((Double(currentDeck.masteredWordCount) / Double(currentDeck.totalWordCount) * 100).rounded()))
    }

    private var currentItem: VocabReviewItem? {
        currentItem(for: selectedMode)
    }

    private func currentItem(for mode: VocabStudyMode) -> VocabReviewItem? {
        if isExtraPractice {
            guard extraQueue.indices.contains(extraIndex) else { return nil }
            return extraQueue[extraIndex]
        }

        switch mode {
        case .today:
            return learningQueue.first ?? reviewQueue.first ?? studyQueue.first
        case .learning:
            return learningQueue.first
        case .review:
            return reviewQueue.first
        case .study:
            return studyQueue.first
        }
    }

    private var currentQueueCount: Int {
        queueCount(for: selectedMode)
    }

    private func queueCount(for mode: VocabStudyMode) -> Int {
        if isExtraPractice {
            return max(0, extraQueue.count - extraIndex)
        }

        switch mode {
        case .today:
            return learningQueue.count + reviewQueue.count + studyQueue.count
        case .learning:
            return learningQueue.count
        case .review:
            return reviewQueue.count
        case .study:
            return studyQueue.count
        }
    }

    private var actionTitle: String {
        switch appTaskStatus?.state {
        case "ready": "开始今日单词"
        case "completed_today": "今日已完成"
        case "uninitialized", "event_not_configured", "config_invalid", nil: "初始化今日单词"
        case "no_primary_event": "缺少主事件"
        default: "查看状态"
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            VocabSubpageSwitcher(selection: $activeSubpage)
                .padding(.horizontal, 32)
                .padding(.top, 18)
                .padding(.bottom, 10)

            Group {
                switch activeSubpage {
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
                case .today:
                    VocabFocusWorkContent(
                        isPaused: false,
                        onCompleteTaskAndFinish: { await completeStandaloneTodayWork() },
                        onStopFocus: { await stopStandaloneFocus() }
                    )
                    .padding(.horizontal, 22)
                    .padding(.bottom, 22)
                case .study:
                    standaloneQueueContent(mode: .study)
                case .review:
                    standaloneQueueContent(mode: .review)
                case .mistakes:
                    mistakesContent
                }
            }
        }
        .navigationTitle("背单词")
        .overlay {
            if isLoading {
                ProgressView()
                    .padding(28)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
        }
        .background(ArkTheme.shellBackground.ignoresSafeArea())
        .sheet(isPresented: $isSettingsPresented) {
            VocabSettingsSheet(
                decks: decks,
                selectedDeckId: selectedDeckId,
                targetCount: $settingsTargetCount,
                focusMinutes: $settingsFocusMinutes,
                isSaving: isSavingSettings,
                onSelectDeck: { deckId in
                    selectedDeckId = deckId
                    Task { await loadDeckContent(deckId: deckId) }
                },
                onCancel: {
                    isSettingsPresented = false
                },
                onSave: {
                    Task { await saveSettings() }
                }
            )
            .presentationDetents([.medium, .large])
        }
        .sheet(item: $selectedWordDetail) { detail in
            VocabWordDetailSheet(detail: detail)
        }
        .task {
            await load()
        }
        .task(id: mistakesLoadKey) {
            if activeSubpage == .mistakes {
                await loadMistakes()
            }
        }
    }

    @ViewBuilder
    private var overviewContent: some View {
        VocabHomeHero(
            statusLabel: eventStatusText,
            eventLabel: eventLabel,
            deckName: primaryDeck?.name,
            summary: todaySummary,
            progressPercent: progressPercent,
            primaryActionTitle: primaryActionTitle,
            isPrimaryActionDisabled: isPrimaryActionDisabled,
            isActing: isActing || isSavingSettings,
            onConfigure: openSettings,
            onPrimaryAction: {
                Task { await runPrimaryAction() }
            }
        )

        VocabLearningAssets(
            overview: overview,
            activeDeck: primaryDeck,
            masteryPercent: currentDeckMasteryPercent
        )

        VocabManagedArrangements(
            status: appTaskStatus,
            isTodayComplete: isTodayComplete,
            hasEventAppConfig: hasEventAppConfig,
            actionTitle: arrangementActionTitle,
            disabledReason: appTaskDisabledReason,
            isBusy: isActing || isSavingSettings,
            onConfigure: openSettings,
            onAction: {
                Task { await runPrimaryAction() }
            }
        )

        if let errorMessage {
            Text(errorMessage)
                .foregroundStyle(.red)
                .arkCard()
        }
    }

    private func standaloneQueueContent(mode: VocabStudyMode) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HStack(alignment: .bottom, spacing: 18) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(mode.heading)
                            .font(.system(size: 34, weight: .semibold))
                        Text(mode.webSubtitle)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    if mode == .review {
                        Button {
                            activeSubpage = .mistakes
                        } label: {
                            Label("查看错题池", systemImage: "tray.full")
                        }
                        .buttonStyle(.bordered)
                    }
                }

                VocabDeckStrip(
                    decks: decks,
                    activeDeck: primaryDeck,
                    onSelectDeck: { deck in
                        selectedDeckId = deck.id
                        Task { await loadDeckContent(deckId: deck.id) }
                    }
                )

                VocabStudyWorkbench(
                    mode: mode,
                    item: currentItem(for: mode),
                    queueCount: queueCount(for: mode),
                    revealed: revealed,
                    lastResult: lastResult,
                    isSubmitting: isSubmitting,
                    isLoadingExtra: isLoadingExtra,
                    isExtraPractice: isExtraPractice,
                    onToggleReveal: { revealed.toggle() },
                    onSubmit: { result in
                        Task { await submit(result, mode: mode) }
                    },
                    onPracticeAgain: {
                        Task { await loadExtraPractice() }
                    },
                    onOpenDetail: { item in
                        selectedWordDetail = wordDetail(from: item)
                    }
                )

                if let errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .arkCard()
                }
            }
            .frame(maxWidth: 1040)
            .padding(.horizontal, 32)
            .padding(.vertical, 22)
            .frame(maxWidth: .infinity)
        }
    }

    @ViewBuilder
    private var mistakesContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("错题池")
                        .font(.system(size: 34, weight: .semibold))
                    Text("这里保留最近答错的词，适合做快速回捞和集中补洞。")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }

                VocabDeckStrip(
                    decks: decks,
                    activeDeck: primaryDeck,
                    onSelectDeck: { deck in
                        selectedDeckId = deck.id
                        Task {
                            await loadDeckContent(deckId: deck.id)
                            await loadMistakes(force: true)
                        }
                    }
                )

                if isLoadingMistakes {
                    ProgressView("错题加载中...")
                        .frame(maxWidth: .infinity, minHeight: 180)
                        .arkCard()
                } else if let mistakesError {
                    Text(mistakesError)
                        .foregroundStyle(.red)
                        .arkCard()
                } else if mistakeItems.isEmpty {
                    Text("当前没有错题。")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, minHeight: 140)
                        .arkCard()
                } else {
                    LazyVStack(spacing: 14) {
                        ForEach(mistakeItems) { item in
                            Button {
                                selectedWordDetail = wordDetail(from: item)
                            } label: {
                                VocabMistakeRow(item: item)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .frame(maxWidth: 1040)
            .padding(.horizontal, 32)
            .padding(.vertical, 22)
            .frame(maxWidth: .infinity)
        }
    }

    private func load() async {
        guard let token = session.token else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            async let decksResponse: [VocabDeck] = session.api.get("/api/vocab/decks", token: token)
            async let statusResponse: AppTaskStatus = session.api.get("/todo/app-tasks/vocab/status", token: token)
            let loadedDecks = try await decksResponse
            decks = loadedDecks
            if selectedDeckId == nil {
                selectedDeckId = loadedDecks.first?.id
            }
            appTaskStatus = try? await statusResponse

            if let deckId = selectedDeckId ?? loadedDecks.first?.id {
                await loadDeckContent(deckId: deckId)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadDeckContent(deckId: String) async {
        guard let token = session.token else { return }
        errorMessage = nil
        revealed = false
        lastResult = nil
        isExtraPractice = false
        extraQueue = []
        extraIndex = 0

        do {
            async let todayResponse: VocabTodaySummary = session.api.get("/api/vocab/decks/\(deckId)/today", token: token)
            async let overviewResponse: VocabOverview = session.api.get("/api/vocab/decks/\(deckId)/overview", token: token)
            async let learningResponse: [VocabReviewItem] = session.api.get("/api/vocab/decks/\(deckId)/learning?limit=10", token: token)
            async let reviewResponse: [VocabReviewItem] = session.api.get("/api/vocab/decks/\(deckId)/review?limit=10", token: token)
            async let studyResponse: [VocabReviewItem] = session.api.get("/api/vocab/decks/\(deckId)/study?limit=10", token: token)

            todaySummary = try await todayResponse
            overview = try? await overviewResponse
            learningQueue = (try? await learningResponse) ?? []
            reviewQueue = (try? await reviewResponse) ?? []
            studyQueue = (try? await studyResponse) ?? []
            cardStartedAt = Date()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func runPrimaryAction() async {
        guard let token = session.token else { return }
        let completedOrDone = appTaskStatus?.state == "completed_today" || isTodayComplete
        if completedOrDone || appTaskStatus?.state == "event_not_configured" || appTaskStatus?.state == "config_invalid" {
            openSettings()
            return
        }

        isActing = true
        errorMessage = nil
        defer { isActing = false }

        do {
            if appTaskStatus?.state == "ready", let taskId = appTaskStatus?.taskId {
                let _: EmptyResponse = try await session.api.post("/todo/tasks/\(taskId)/focus/start", token: token)
            } else {
                guard let deck = primaryDeck else {
                    errorMessage = "没有可初始化的词库"
                    return
                }
                let payload = VocabAppTaskInitPayload(
                    deckId: deck.id,
                    dailyTargetCount: 30,
                    defaultFocusDuration: 1500,
                    addToTodayPlan: true
                )
                appTaskStatus = try await session.api.post("/todo/app-tasks/vocab/init", token: token, body: payload)
            }

            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func openSettings() {
        settingsTargetCount = modalInitialTarget
        settingsFocusMinutes = max(5, (appTaskStatus?.config?["default_focus_duration"]?.intValue ?? 1500) / 60)
        if selectedDeckId == nil {
            selectedDeckId = primaryDeck?.id
        }
        isSettingsPresented = true
    }

    private func saveSettings() async {
        guard let token = session.token, let deck = primaryDeck else { return }
        isSavingSettings = true
        errorMessage = nil
        defer { isSavingSettings = false }

        do {
            let settingsPayload = VocabTodaySettingsPayload(totalTargetCount: settingsTargetCount)
            todaySummary = try await session.api.put("/api/vocab/decks/\(deck.id)/today/settings", token: token, body: settingsPayload)

            let initPayload = VocabAppTaskInitPayload(
                deckId: deck.id,
                dailyTargetCount: settingsTargetCount,
                defaultFocusDuration: settingsFocusMinutes * 60,
                addToTodayPlan: true
            )
            appTaskStatus = try await session.api.post("/todo/app-tasks/vocab/init", token: token, body: initPayload)
            overview = try? await session.api.get("/api/vocab/decks/\(deck.id)/overview", token: token)
            isSettingsPresented = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func completeStandaloneTodayWork() async -> Bool {
        await stopStandaloneFocus()
        return true
    }

    private func stopStandaloneFocus() async {
        guard let token = session.token else { return }
        do {
            let _: EmptyResponse = try await session.api.post("/todo/focus/stop", token: token)
            await load()
            activeSubpage = .overview
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func submit(_ result: VocabMemoryResult, mode: VocabStudyMode? = nil) async {
        if isExtraPractice {
            lastResult = nil
            if extraIndex < extraQueue.count {
                extraIndex += 1
            }
            revealed = false
            cardStartedAt = Date()
            return
        }

        let activeMode = mode ?? selectedMode
        guard let token = session.token, let deck = primaryDeck, let item = currentItem(for: activeMode) else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            let responseMs = max(0, Int(Date().timeIntervalSince(cardStartedAt) * 1000))
            let payload = VocabReviewSubmitPayload(
                deckId: deck.id,
                wordId: item.id,
                result: result.rawValue,
                reviewMode: item.reviewMode,
                promptType: item.promptType,
                responseMs: responseMs
            )
            let response: VocabReviewSubmitResult = try await session.api.post("/api/vocab/reviews", token: token, body: payload)
            lastResult = response
            consume(item, shouldRepeatToday: response.shouldRepeatToday)
            revealed = false
            cardStartedAt = Date()

            if let deckId = selectedDeckId {
                todaySummary = try? await session.api.get("/api/vocab/decks/\(deckId)/today", token: token)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func consume(_ item: VocabReviewItem, shouldRepeatToday: Bool) {
        switch item.reviewMode {
        case "learning":
            learningQueue = consume(item, in: learningQueue, shouldRepeatToday: shouldRepeatToday)
        case "review":
            reviewQueue = consume(item, in: reviewQueue, shouldRepeatToday: shouldRepeatToday)
        case "study":
            studyQueue = consume(item, in: studyQueue, shouldRepeatToday: shouldRepeatToday)
        default:
            learningQueue = consume(item, in: learningQueue, shouldRepeatToday: shouldRepeatToday)
            reviewQueue = consume(item, in: reviewQueue, shouldRepeatToday: shouldRepeatToday)
            studyQueue = consume(item, in: studyQueue, shouldRepeatToday: shouldRepeatToday)
        }
    }

    private func consume(_ item: VocabReviewItem, in queue: [VocabReviewItem], shouldRepeatToday: Bool) -> [VocabReviewItem] {
        var next = queue
        if let index = next.firstIndex(where: { $0.id == item.id && $0.reviewMode == item.reviewMode }) {
            let removed = next.remove(at: index)
            if shouldRepeatToday {
                next.append(removed)
            }
        }
        return next
    }

    private func loadExtraPractice() async {
        guard let token = session.token, let deck = primaryDeck else { return }
        isLoadingExtra = true
        errorMessage = nil
        defer { isLoadingExtra = false }

        do {
            let words: [VocabCurrentWordBrief] = try await session.api.get(
                "/api/vocab/decks/\(deck.id)/overview/current-words?state=all",
                token: token
            )
            let selected = Array(words.shuffled().prefix(10))
            var items: [VocabReviewItem] = []

            for word in selected {
                let detail: VocabWordDetail = try await session.api.get("/api/vocab/words/\(word.id)", token: token)
                items.append(
                    VocabReviewItem(
                        id: detail.id,
                        deckId: detail.deckId,
                        word: detail.word,
                        usPronunciation: detail.usPronunciation,
                        ukPronunciation: detail.ukPronunciation,
                        translations: detail.translations,
                        phrases: detail.phrases,
                        sentences: detail.sentences,
                        promptType: "en_to_zh",
                        reviewMode: "study",
                        masteryScore: 0
                    )
                )
            }

            extraQueue = items
            extraIndex = 0
            isExtraPractice = !items.isEmpty
            selectedMode = .today
            revealed = false
            lastResult = nil
            cardStartedAt = Date()

            if items.isEmpty {
                errorMessage = "当前词书没有可加练的单词"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadMistakes(force: Bool = false) async {
        guard let token = session.token, let deck = primaryDeck else { return }
        if !force, loadedMistakesDeckId == deck.id { return }

        isLoadingMistakes = true
        mistakesError = nil
        defer { isLoadingMistakes = false }

        do {
            mistakeItems = try await session.api.get("/api/vocab/decks/\(deck.id)/mistakes?limit=50", token: token)
            loadedMistakesDeckId = deck.id
        } catch {
            mistakesError = error.localizedDescription
        }
    }

    private func wordDetail(from item: VocabReviewItem) -> VocabWordDetail {
        VocabWordDetail(
            id: item.id,
            deckId: item.deckId,
            word: item.word,
            usPronunciation: item.usPronunciation,
            ukPronunciation: item.ukPronunciation,
            translations: item.translations,
            phrases: item.phrases,
            sentences: item.sentences
        )
    }

    private func wordDetail(from item: VocabMistakeItem) -> VocabWordDetail {
        VocabWordDetail(
            id: item.id,
            deckId: item.deckId,
            word: item.word,
            usPronunciation: item.usPronunciation,
            ukPronunciation: item.ukPronunciation,
            translations: item.translations,
            phrases: item.phrases,
            sentences: item.sentences
        )
    }
}

private enum VocabSubpage: String, CaseIterable, Identifiable {
    case overview
    case today
    case study
    case review
    case mistakes

    var id: String { rawValue }

    var title: String {
        switch self {
        case .overview: "概览"
        case .today: "今日单词"
        case .study: "新词学习"
        case .review: "今日复习"
        case .mistakes: "错题池"
        }
    }

    var symbol: String {
        switch self {
        case .overview: "chart.pie"
        case .today: "rectangle.stack"
        case .study: "sparkle.magnifyingglass"
        case .review: "questionmark.circle"
        case .mistakes: "tray.full"
        }
    }
}

private struct VocabSubpageSwitcher: View {
    @Binding var selection: VocabSubpage

    var body: some View {
        SubAppTabSwitcher(
            selection: $selection,
            tabs: VocabSubpage.allCases.map { page in
                SubAppTabDescriptor(id: page, title: page.title, symbol: page.symbol)
            }
        )
    }
}

private struct VocabHomeHero: View {
    let statusLabel: String
    let eventLabel: String
    let deckName: String?
    let summary: VocabTodaySummary?
    let progressPercent: Int
    let primaryActionTitle: String
    let isPrimaryActionDisabled: Bool
    let isActing: Bool
    let onConfigure: () -> Void
    let onPrimaryAction: () -> Void

    private var heroValue: String {
        summary.map { "\($0.completedCount) / \($0.totalCount)" } ?? "--"
    }

    var body: some View {
        SubAppHeroCard(
            eyebrow: "VOCABULARY",
            title: "背单词",
            statusLabel: statusLabel,
            metaItems: [eventLabel, "当前词书：\(deckName ?? "未选择词书")"],
            progressPercent: progressPercent,
            progressLabel: "今日完成度",
            heroEyebrow: "TODAY WORKSPACE",
            heroLabel: "今日单词任务",
            heroValue: heroValue,
            heroDetail: deckName == nil ? "请选择词书后开始今日学习" : "复习与新词会按今日计划自动衔接。",
            primaryActionTitle: primaryActionTitle,
            isPrimaryActionDisabled: isPrimaryActionDisabled,
            isActing: isActing,
            metrics: [
                SubAppMetricItem(label: "今日进度", value: heroValue, detail: "\(progressPercent)%"),
                SubAppMetricItem(label: "待完成", value: "\(summary?.pendingCount ?? 0)", detail: "REMAINING"),
                SubAppMetricItem(label: "新词", value: "\(summary?.newCount ?? 0)", detail: "NEW"),
                SubAppMetricItem(label: "复习", value: "\(summary?.reviewCount ?? 0)", detail: "REVIEW"),
            ],
            toolbar: {
                Button(action: onConfigure) {
                    Label("配置", systemImage: "gearshape")
                }
                .buttonStyle(.borderedProminent)
                .tint(.white)
                .foregroundStyle(.primary)
                .disabled(deckName == nil)
            },
            onPrimaryAction: onPrimaryAction
        )
    }
}

private struct VocabLearningAssets: View {
    let overview: VocabOverview?
    let activeDeck: VocabDeck?
    let masteryPercent: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SubAppSectionHeading(
                eyebrow: "LEARNING ASSETS",
                title: "长期积累",
                description: "词书完成度、全局掌握量与当前词书阶段都收束在这里。"
            )

            if let overview {
                HStack(spacing: 16) {
                    VocabAssetSummaryCard(
                        label: "已完成词书",
                        value: "\(overview.completedDeckCount) / \(overview.totalDeckCount) 本",
                        detail: "全部单词都已进入 Review 状态的词书数量。"
                    )
                    VocabAssetSummaryCard(
                        label: "累计掌握单词",
                        value: "\(overview.masteredWordCount)",
                        detail: "按 FSRS Review 口径统计的全局已掌握单词总数。"
                    )
                }

                VocabCurrentDeckAssetCard(
                    currentDeck: overview.currentDeck,
                    activeDeckName: activeDeck?.name,
                    masteryPercent: masteryPercent
                )
            } else {
                Text("学习资产加载中...")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 120)
                    .subAppGlassCard(cornerRadius: 12)
            }
        }
    }
}

private struct VocabAssetSummaryCard: View {
    let label: String
    let value: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(label)
                .font(.callout)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(size: 32, weight: .semibold))
            Text(detail)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, minHeight: 116, alignment: .topLeading)
        .padding(20)
        .vocabAssetCard()
    }
}

private struct VocabCurrentDeckAssetCard: View {
    let currentDeck: VocabOverviewCurrentDeck
    let activeDeckName: String?
    let masteryPercent: Int

    private var total: Int {
        max(currentDeck.totalWordCount, 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("当前词书掌握度")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    Text(activeDeckName ?? currentDeck.deckName)
                        .font(.title2.weight(.semibold))
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 8) {
                    Text("已掌握")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    Text("\(currentDeck.masteredWordCount) / \(currentDeck.totalWordCount)")
                        .font(.title2.weight(.semibold))
                }
            }

            ProgressView(value: Double(masteryPercent), total: 100)
                .tint(ArkTheme.success)

            VStack(spacing: 14) {
                GeometryReader { proxy in
                    HStack(spacing: 0) {
                        Rectangle()
                            .fill(Color.secondary.opacity(0.28))
                            .frame(width: proxy.size.width * CGFloat(currentDeck.unstartedWordCount) / CGFloat(total))
                        Rectangle()
                            .fill(ArkTheme.accent.opacity(0.78))
                            .frame(width: proxy.size.width * CGFloat(currentDeck.learningWordCount) / CGFloat(total))
                        Rectangle()
                            .fill(ArkTheme.success)
                            .frame(width: proxy.size.width * CGFloat(currentDeck.masteredWordCount) / CGFloat(total))
                    }
                    .clipShape(Capsule())
                }
                .frame(height: 12)

                HStack(spacing: 12) {
                    VocabStageChip(label: "未开始", value: currentDeck.unstartedWordCount, color: .secondary)
                    VocabStageChip(label: "学习中", value: currentDeck.learningWordCount, color: ArkTheme.accent)
                    VocabStageChip(label: "已掌握", value: currentDeck.masteredWordCount, color: ArkTheme.success)
                }
            }
            .padding(16)
            .background(ArkTheme.success.opacity(0.055), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(ArkTheme.success.opacity(0.18), lineWidth: 1)
            }
        }
        .padding(20)
        .vocabAssetCard()
    }
}

private struct VocabStageChip: View {
    let label: String
    let value: Int
    let color: Color

    var body: some View {
        HStack {
            HStack(spacing: 8) {
                Circle()
                    .fill(color)
                    .frame(width: 9, height: 9)
                Text(label)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text("\(value)")
                .font(.headline)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

private struct VocabManagedArrangements: View {
    let status: AppTaskStatus?
    let isTodayComplete: Bool
    let hasEventAppConfig: Bool
    let actionTitle: String
    let disabledReason: String?
    let isBusy: Bool
    let onConfigure: () -> Void
    let onAction: () -> Void

    private var taskState: SubAppManagedDisplayState {
        subAppManagedDisplayState(
            state: status?.state,
            enabled: true,
            completedOverride: isTodayComplete
        )
    }

    private var actionDisabled: Bool {
        isBusy || actionTitle == "不可用"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            SubAppSectionHeading(eyebrow: "MANAGED ARRANGEMENTS", title: "托管安排", description: nil, accent: ArkTheme.warning)

            HStack(alignment: .top, spacing: 16) {
                SubAppManagedTaskCard(
                    accent: ArkTheme.warning,
                    title: "今日单词",
                    symbol: "checklist",
                    statusText: subAppManagedStatusText(
                        state: status?.state,
                        enabled: true,
                        completedOverride: isTodayComplete
                    ),
                    statusTint: taskState.tint,
                    focusWorkName: "今日单词",
                    disabledReason: disabledReason,
                    syncLabel: nil,
                    isSynced: false,
                    isSyncEnabled: false,
                    primaryActionTitle: actionTitle == "不可用" ? nil : actionTitle,
                    primaryActionSymbol: actionTitle == "配置" ? "gearshape" : "play.fill",
                    isPrimaryActionDisabled: actionDisabled,
                    showPrimaryProgress: isBusy,
                    onSyncToggle: nil,
                    onPrimaryAction: onAction,
                    onConfigure: onConfigure
                )

                SubAppScheduleCard(
                    accent: ArkTheme.warning,
                    title: "日程",
                    emptyTitle: "暂无日程安排",
                    emptyDetail: "当前子应用尚未生成托管日程"
                )
            }
        }
        .padding(20)
        .subAppGlassCard(cornerRadius: 12)
    }
}

private struct VocabSettingsSheet: View {
    let decks: [VocabDeck]
    let selectedDeckId: String?
    @Binding var targetCount: Int
    @Binding var focusMinutes: Int
    let isSaving: Bool
    let onSelectDeck: (String) -> Void
    let onCancel: () -> Void
    let onSave: () -> Void

    private var selectedDeckBinding: Binding<String> {
        Binding(
            get: { selectedDeckId ?? decks.first?.id ?? "" },
            set: { onSelectDeck($0) }
        )
    }

    var body: some View {
        SubAppSettingsFormScreen(
            title: "调整今日单词",
            isSaving: isSaving,
            isSaveDisabled: decks.isEmpty,
            onCancel: onCancel,
            onSave: onSave
        ) {
            Section("词书") {
                if decks.isEmpty {
                    Text("暂无可选词书")
                        .foregroundStyle(.secondary)
                } else {
                    Picker("当前词书", selection: selectedDeckBinding) {
                        ForEach(decks) { deck in
                            Text(deck.name).tag(deck.id)
                        }
                    }
                }
            }

            Section("今日计划") {
                Stepper("目标 \(targetCount) 个单词", value: $targetCount, in: 1...200)
                Stepper("专注 \(focusMinutes) 分钟", value: $focusMinutes, in: 5...120, step: 5)
            }
        }
    }
}

private extension View {
    func vocabAssetCard() -> some View {
        background(
            LinearGradient(
                colors: [
                    ArkTheme.success.opacity(0.10),
                    Color.white.opacity(0.18)
                ],
                startPoint: .top,
                endPoint: .bottom
            ),
            in: RoundedRectangle(cornerRadius: 12, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(ArkTheme.success.opacity(0.18), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.035), radius: 14, x: 0, y: 8)
    }
}

private struct VocabDeckCard: View {
    let deck: VocabDeck
    let isSelected: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "book.closed")
                    .font(.title2)
                    .foregroundStyle(ArkTheme.accent)
                Spacer()
                Text("\(deck.wordCount ?? 0)")
                    .font(.title2.weight(.heavy))
            }
            Text(deck.name)
                .font(.headline)
            Text(deck.description ?? "单词量：\(deck.wordCount ?? 0)")
                .font(.callout)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, minHeight: 140, alignment: .topLeading)
        .arkCard()
        .overlay {
            RoundedRectangle(cornerRadius: ArkTheme.cardRadius, style: .continuous)
                .stroke(isSelected ? ArkTheme.accent : .clear, lineWidth: 2)
        }
    }
}

private struct VocabDeckStrip: View {
    let decks: [VocabDeck]
    let activeDeck: VocabDeck?
    let onSelectDeck: (VocabDeck) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("词书")
                .font(.headline)

            if decks.isEmpty {
                Text("词书加载中...")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .arkCard()
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(decks) { deck in
                            Button {
                                onSelectDeck(deck)
                            } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: "book")
                                        .font(.title3.weight(.semibold))
                                        .foregroundStyle(ArkTheme.accent)

                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(deck.name)
                                            .font(.headline)
                                            .foregroundStyle(.primary)
                                        Text(deck.description ?? "单词量：\(deck.wordCount ?? 0)")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(1)
                                    }

                                    Text("\(deck.wordCount ?? 0)")
                                        .font(.headline.monospacedDigit())
                                        .foregroundStyle(.primary)
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 14)
                                .frame(minWidth: 300, alignment: .leading)
                                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                                .overlay {
                                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                                        .stroke(deck.id == activeDeck?.id ? ArkTheme.accent : .white.opacity(0.45), lineWidth: deck.id == activeDeck?.id ? 2 : 1)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }
}

private struct VocabMistakeRow: View {
    let item: VocabMistakeItem

    private var translationText: String {
        item.translations.prefix(3).map(\.translation).joined(separator: "  ")
    }

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 9) {
                Text(item.word)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.primary)

                if !translationText.isEmpty {
                    Text(translationText)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }

                HStack(spacing: 14) {
                    if let us = item.usPronunciation, !us.isEmpty {
                        Text("US /\(us)/")
                    }
                    if let uk = item.ukPronunciation, !uk.isEmpty {
                        Text("UK /\(uk)/")
                    }
                }
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
            }

            Spacer()

            Text("错 \(item.wrongCount) 次")
                .font(.callout.weight(.semibold))
                .foregroundStyle(.red)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Color.red.opacity(0.10), in: Capsule())
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(.white.opacity(0.45), lineWidth: 1)
        }
    }
}

private struct VocabWordDetailSheet: View {
    let detail: VocabWordDetail
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 26) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(detail.word)
                            .font(.system(size: 44, weight: .semibold))
                            .minimumScaleFactor(0.7)
                            .lineLimit(1)

                        HStack(spacing: 18) {
                            if let us = detail.usPronunciation, !us.isEmpty {
                                Text("US /\(us)/")
                            }
                            if let uk = detail.ukPronunciation, !uk.isEmpty {
                                Text("UK /\(uk)/")
                            }
                        }
                        .font(.callout.monospaced())
                        .foregroundStyle(.secondary)
                    }

                    VocabWordDetailSection(title: "释义") {
                        VocabFlowLayout(spacing: 8, rowSpacing: 10) {
                            ForEach(Array(detail.translations.enumerated()), id: \.offset) { _, item in
                                Text("\(item.pos.map { "\($0). " } ?? "")\(item.translation)")
                                    .font(.callout)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 8)
                                    .background(.thinMaterial, in: Capsule())
                            }
                        }
                    }

                    if !detail.sentences.isEmpty {
                        VocabWordDetailSection(title: "例句") {
                            VStack(spacing: 10) {
                                ForEach(Array(detail.sentences.enumerated()), id: \.offset) { _, item in
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(item.sentence)
                                            .font(.callout)
                                        Text(item.translation)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(14)
                                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                                }
                            }
                        }
                    }

                    if !detail.phrases.isEmpty {
                        VocabWordDetailSection(title: "短语") {
                            VStack(spacing: 10) {
                                ForEach(Array(detail.phrases.enumerated()), id: \.offset) { _, item in
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(item.phrase)
                                            .font(.headline)
                                        Text(item.translation)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(14)
                                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                                }
                            }
                        }
                    }
                }
                .padding(28)
            }
            .background(ArkTheme.shellBackground.ignoresSafeArea())
            .navigationTitle("单词详情")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("关闭") {
                        dismiss()
                    }
                }
            }
        }
    }
}

private struct VocabWordDetailSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(.caption.weight(.semibold))
                .tracking(5)
                .foregroundStyle(.secondary)

            content()
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(.white.opacity(0.45), lineWidth: 1)
            }
    }
}

private struct VocabFlowLayout: Layout {
    let spacing: CGFloat
    let rowSpacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? 700
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > maxWidth {
                x = 0
                y += rowHeight + rowSpacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }

        return CGSize(width: maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + rowSpacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

private struct VocabStudyWorkbench: View {
    let mode: VocabStudyMode
    let item: VocabReviewItem?
    let queueCount: Int
    let revealed: Bool
    let lastResult: VocabReviewSubmitResult?
    let isSubmitting: Bool
    let isLoadingExtra: Bool
    let isExtraPractice: Bool
    let onToggleReveal: () -> Void
    let onSubmit: (VocabMemoryResult) -> Void
    let onPracticeAgain: () -> Void
    let onOpenDetail: (VocabReviewItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 6) {
                    Text(isExtraPractice ? "再来一次" : mode.heading)
                        .font(.title2.weight(.bold))
                    Text(isExtraPractice ? "本轮加练只切卡，不写入今日复习记录。" : mode.subtitle)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Label("\(queueCount)", systemImage: "tray.full")
                    .font(.headline)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(.thinMaterial, in: Capsule())
            }

            if let item {
                VocabWordCard(item: item, revealed: revealed, onToggleReveal: onToggleReveal)

                HStack(spacing: 12) {
                    ForEach(VocabMemoryResult.allCases) { result in
                        Button {
                            onSubmit(result)
                        } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Label(result.title, systemImage: result.symbol)
                                    .font(.headline)
                                Text(result.hint)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                        .tint(result.tint)
                        .disabled(isSubmitting)
                    }
                }

                if let lastResult {
                    HStack(spacing: 12) {
                        Label("掌握度 \(Int(lastResult.masteryScore.rounded()))", systemImage: "waveform.path.ecg")
                        Label("间隔 \(lastResult.intervalDays) 天", systemImage: "calendar")
                        Label(lastResult.shouldRepeatToday ? "稍后重复" : "已进入下一词", systemImage: lastResult.shouldRepeatToday ? "arrow.triangle.2.circlepath" : "checkmark.circle")
                    }
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .arkCard()
                }

                Button {
                    onOpenDetail(item)
                } label: {
                    Label(mode == .review ? "查看单词详情" : "查看完整词条", systemImage: "doc.text.magnifyingglass")
                }
                .buttonStyle(.bordered)
            } else {
                VStack(spacing: 18) {
                    Image(systemName: "checkmark.seal")
                        .font(.system(size: 42, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Text(mode.emptyTitle)
                        .font(.title3.weight(.bold))
                        .multilineTextAlignment(.center)
                    Text(mode.emptyDescription)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)

                    Button {
                        onPracticeAgain()
                    } label: {
                        if isLoadingExtra {
                            ProgressView()
                        } else {
                            Label("再来一次", systemImage: "arrow.triangle.2.circlepath")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(isLoadingExtra)
                }
                .arkCard()
            }
        }
        .arkCard()
    }
}

private struct VocabWordCard: View {
    let item: VocabReviewItem
    let revealed: Bool
    let onToggleReveal: () -> Void

    private var posTags: [String] {
        Array(Set(item.translations.compactMap(\.pos))).sorted()
    }

    private var translationsText: String {
        item.translations.map { translation in
            return translation.translation
        }.joined(separator: "；")
    }

    var body: some View {
        VStack(spacing: 22) {
            Text(item.reviewMode.uppercased())
                .font(.caption.weight(.semibold))
                .tracking(3)
                .foregroundStyle(.secondary)

            HStack(spacing: 8) {
                Text(item.word)
                    .font(.system(size: 56, weight: .heavy, design: .rounded))
                    .minimumScaleFactor(0.65)
                    .lineLimit(1)

                ForEach(posTags, id: \.self) { pos in
                    Text(pos.uppercased())
                        .font(.caption.weight(.bold))
                        .padding(.horizontal, 9)
                        .padding(.vertical, 5)
                        .background(ArkTheme.success.opacity(0.13), in: Capsule())
                        .foregroundStyle(ArkTheme.success)
                }
            }

            HStack(spacing: 20) {
                if let us = item.usPronunciation, !us.isEmpty {
                    Text("US /\(us)/")
                }
                if let uk = item.ukPronunciation, !uk.isEmpty {
                    Text("UK /\(uk)/")
                }
            }
            .font(.callout.monospaced())
            .foregroundStyle(.secondary)

            Divider()

            if revealed || item.reviewMode == "review" {
                VStack(spacing: 14) {
                    Text(translationsText.isEmpty ? "暂无释义" : translationsText)
                        .font(.title3.weight(.semibold))
                        .multilineTextAlignment(.center)

                    if let sentence = item.sentences.first {
                        VStack(spacing: 6) {
                            Text(sentence.sentence)
                                .font(.callout)
                            Text(sentence.translation)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .multilineTextAlignment(.center)
                    } else if let phrase = item.phrases.first {
                        Text("\(phrase.phrase)：\(phrase.translation)")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity)
            } else {
                Text("先在脑中回忆释义")
                    .font(.headline)
                    .foregroundStyle(.secondary)
            }

            Button {
                onToggleReveal()
            } label: {
                Label(revealed ? "收起释义" : "显示释义", systemImage: revealed ? "eye.slash" : "eye")
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, minHeight: 360)
        .padding(28)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.separator.opacity(0.35), lineWidth: 1)
        }
    }
}

private enum VocabStudyMode: String, CaseIterable, Identifiable {
    case today
    case learning
    case review
    case study

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today: "今日"
        case .learning: "学习中"
        case .review: "复习"
        case .study: "新词"
        }
    }

    var heading: String {
        switch self {
        case .today: "完成今日单词"
        case .learning: "学习中"
        case .review: "今日复习"
        case .study: "新词学习"
        }
    }

    var subtitle: String {
        switch self {
        case .today: "学习中、复习、新词按 Web 端顺序推进。"
        case .learning: "先稳住还没掌握的词。"
        case .review: "先回忆，再提交结果。"
        case .study: "看熟词形、音标和基本释义。"
        }
    }

    var webSubtitle: String {
        switch self {
        case .study:
            "按词书切换今天待学的新词，先把词形、音标和基本释义看熟。"
        case .review:
            "先回忆，再提交结果。间隔和掌握度由后端统一推进。"
        case .today:
            "先完成今天这一个词，再进入下一步。"
        case .learning:
            subtitle
        }
    }

    var emptyTitle: String {
        switch self {
        case .today: "今天这本词书的单词已经完成了"
        case .learning: "当前没有学习中单词"
        case .review: "当前没有到期复习词"
        case .study: "当前没有待学新词"
        }
    }

    var emptyDescription: String {
        switch self {
        case .today: "可以切换词书，或稍后由后端计划生成新的队列。"
        case .learning: "这通常表示近期卡片已被推进到复习阶段。"
        case .review: "间隔复习队列暂时为空。"
        case .study: "今日新词额度已经用完或词书无新词。"
        }
    }
}

private enum VocabMemoryResult: String, CaseIterable, Identifiable {
    case again
    case hard
    case good
    case easy

    var id: String { rawValue }

    var title: String {
        switch self {
        case .again: "没记住"
        case .hard: "有点难"
        case .good: "记住了"
        case .easy: "很轻松"
        }
    }

    var hint: String {
        switch self {
        case .again: "今天稍后再看"
        case .hard: "较短间隔"
        case .good: "正常间隔"
        case .easy: "延后更久"
        }
    }

    var symbol: String {
        switch self {
        case .again: "xmark.circle"
        case .hard: "exclamationmark.triangle"
        case .good: "checkmark.circle"
        case .easy: "paperplane"
        }
    }

    var tint: Color {
        switch self {
        case .again: .red
        case .hard: ArkTheme.warning
        case .good: ArkTheme.success
        case .easy: ArkTheme.accent
        }
    }
}

private func statusDescription(_ state: String?) -> String {
    switch state {
    case "ready": "今日单词已就绪"
    case "completed_today": "今日单词已完成"
    case "uninitialized": "今日单词尚未初始化"
    case "event_not_configured": "当前事件尚未配置今日单词"
    case "config_invalid": "今日单词配置需要修复"
    case "no_primary_event": "没有主事件"
    case "blocked": "今日单词暂不可用"
    default: "正在读取托管任务状态"
    }
}
