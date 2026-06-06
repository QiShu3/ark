import SwiftUI

struct VocabScreen: View {
    @EnvironmentObject private var session: AppSession
    @State private var decks: [VocabDeck] = []
    @State private var appTaskStatus: AppTaskStatus?
    @State private var todaySummary: VocabTodaySummary?
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
    @State private var errorMessage: String?

    private var primaryDeck: VocabDeck? {
        decks.first { $0.id == selectedDeckId } ?? decks.first
    }

    private var progressPercent: Int {
        guard let todaySummary, todaySummary.totalCount > 0 else { return 0 }
        return min(100, Int((Double(todaySummary.completedCount) / Double(todaySummary.totalCount) * 100).rounded()))
    }

    private var currentItem: VocabReviewItem? {
        if isExtraPractice {
            guard extraQueue.indices.contains(extraIndex) else { return nil }
            return extraQueue[extraIndex]
        }

        switch selectedMode {
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
        if isExtraPractice {
            return max(0, extraQueue.count - extraIndex)
        }

        switch selectedMode {
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
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack(alignment: .center, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("背单词")
                            .font(.largeTitle.weight(.heavy))
                        Text(primaryDeck.map { "当前词书：\($0.name)" } ?? "读取 Web 端词书与今日队列。")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Picker("模式", selection: $selectedMode) {
                        ForEach(VocabStudyMode.allCases) { mode in
                            Text(mode.title).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 430)

                    Button {
                        Task { await load() }
                    } label: {
                        Label("刷新", systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(.bordered)
                }

                HStack(alignment: .top, spacing: 18) {
                    VStack(alignment: .leading, spacing: 18) {
                        HStack(alignment: .top, spacing: 18) {
                            ProgressRing(percent: progressPercent)
                                .frame(width: 120, height: 120)

                            VStack(alignment: .leading, spacing: 8) {
                                Text("Today Workspace")
                                    .font(.caption.weight(.semibold))
                                    .tracking(3)
                                    .foregroundStyle(.secondary)
                                Text(todaySummary.map { "\($0.completedCount) / \($0.totalCount)" } ?? "--")
                                    .font(.system(size: 42, weight: .heavy, design: .rounded))
                                Text("复习与新词会按 Web 端今日计划自动衔接。")
                                    .font(.callout)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        if let eventName = appTaskStatus?.eventName {
                            Text("当前事件：\(eventName)")
                                .font(.callout)
                                .foregroundStyle(.secondary)
                        }

                        if let blockedReason = appTaskStatus?.blockedReason {
                            Text(blockedReason)
                                .font(.callout)
                                .foregroundStyle(.orange)
                        }

                        Button {
                            Task { await runPrimaryAction() }
                        } label: {
                            if isActing {
                                ProgressView()
                            } else {
                                Label(actionTitle, systemImage: appTaskStatus?.state == "ready" ? "play.fill" : "wand.and.stars")
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .disabled(isActing || isLoading || appTaskStatus?.state == "completed_today" || appTaskStatus?.state == "no_primary_event")
                    }
                    .frame(maxWidth: .infinity, minHeight: 250, alignment: .topLeading)
                    .arkCard()

                    VStack(alignment: .leading, spacing: 14) {
                        MetricTile(title: "待完成", value: "\(todaySummary?.pendingCount ?? currentQueueCount)", symbol: "hourglass", tint: ArkTheme.warning)
                        MetricTile(title: "已掌握", value: "\(todaySummary?.memorizedCount ?? 0)", symbol: "checkmark.seal", tint: ArkTheme.success)
                    }
                    .frame(width: 360)
                }

                HStack(alignment: .top, spacing: 18) {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("词库")
                            .font(.title2.weight(.bold))

                        if decks.isEmpty {
                            ContentUnavailableView("等待词库", systemImage: "textformat.abc", description: Text("后端返回词库后会显示在这里。"))
                                .frame(maxWidth: .infinity)
                                .arkCard()
                        } else {
                            ForEach(decks) { deck in
                                Button {
                                    selectedDeckId = deck.id
                                    Task { await loadDeckContent(deckId: deck.id) }
                                } label: {
                                    VocabDeckCard(deck: deck, isSelected: deck.id == primaryDeck?.id)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .frame(width: 300)

                    VocabStudyWorkbench(
                        mode: selectedMode,
                        item: currentItem,
                        queueCount: currentQueueCount,
                        revealed: revealed,
                        lastResult: lastResult,
                        isSubmitting: isSubmitting,
                        isLoadingExtra: isLoadingExtra,
                        isExtraPractice: isExtraPractice,
                        onToggleReveal: { revealed.toggle() },
                        onSubmit: { result in
                            Task { await submit(result) }
                        },
                        onPracticeAgain: {
                            Task { await loadExtraPractice() }
                        }
                    )
                    .frame(maxWidth: .infinity, minHeight: 500)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .arkCard()
                }
            }
            .padding(28)
        }
        .navigationTitle("Vocab")
        .overlay {
            if isLoading {
                ProgressView()
                    .padding(28)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
        }
        .arkScreenBackground()
        .task {
            await load()
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
            async let learningResponse: [VocabReviewItem] = session.api.get("/api/vocab/decks/\(deckId)/learning?limit=10", token: token)
            async let reviewResponse: [VocabReviewItem] = session.api.get("/api/vocab/decks/\(deckId)/review?limit=10", token: token)
            async let studyResponse: [VocabReviewItem] = session.api.get("/api/vocab/decks/\(deckId)/study?limit=10", token: token)

            todaySummary = try await todayResponse
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

    private func submit(_ result: VocabMemoryResult) async {
        if isExtraPractice {
            lastResult = nil
            if extraIndex < extraQueue.count {
                extraIndex += 1
            }
            revealed = false
            cardStartedAt = Date()
            return
        }

        guard let token = session.token, let deck = primaryDeck, let item = currentItem else { return }
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

private struct ProgressRing: View {
    let percent: Int

    var body: some View {
        ZStack {
            Circle()
                .stroke(.separator.opacity(0.35), lineWidth: 14)
            Circle()
                .trim(from: 0, to: CGFloat(percent) / 100)
                .stroke(ArkTheme.accent, style: StrokeStyle(lineWidth: 14, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 2) {
                Text("\(percent)%")
                    .font(.title2.weight(.heavy))
                Text("今日完成度")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
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
