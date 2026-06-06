import SwiftUI

struct ERCScreen: View {
    @EnvironmentObject private var session: AppSession
    @State private var overview: ERCOverview?
    @State private var reviewStatus: AppTaskStatus?
    @State private var practiceStatus: AppTaskStatus?
    @State private var articles: [ERCArticleListItem] = []
    @State private var selectedArticleId: String?
    @State private var articleDetail: ERCArticleDetail?
    @State private var practiceAnswers: [String: String] = [:]
    @State private var reviewNext: ERCReviewNext?
    @State private var selectedOption: String?
    @State private var reviewResult: ERCReviewSubmitResult?
    @State private var reviewStartedAt = Date()
    @State private var isLoading = false
    @State private var isLoadingArticle = false
    @State private var actionInFlight: String?
    @State private var isSubmittingReview = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("ERC")
                            .font(.largeTitle.weight(.heavy))
                        Text("阅读练习、复习和托管安排入口。")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Button {
                        Task { await load() }
                    } label: {
                        Label("刷新", systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(.bordered)
                }

                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 16), count: 4), spacing: 16) {
                    MetricTile(title: "已练文章", value: "\(overview?.practicedArticleCount ?? 0)", symbol: "doc.text")
                    MetricTile(title: "已练题目", value: "\(overview?.practicedQuestionCount ?? 0)", symbol: "checkmark.seal", tint: ArkTheme.success)
                    MetricTile(title: "待复习", value: "\(overview?.dueReviewCount ?? 0)", symbol: "arrow.triangle.2.circlepath")
                    MetricTile(title: "错题", value: "\(overview?.mistakeCount ?? 0)", symbol: "exclamationmark.circle", tint: .red)
                }

                HStack(alignment: .top, spacing: 18) {
                    ERCManagedTaskCard(
                        title: "ERC 复习",
                        subtitle: "对齐 Web 端托管安排里的阅读复习任务。",
                        symbol: "arrow.triangle.2.circlepath",
                        status: reviewStatus,
                        isBusy: actionInFlight == "review",
                        onAction: { Task { await runReviewAction() } }
                    )

                    ERCManagedTaskCard(
                        title: "ERC 真题练习",
                        subtitle: "对齐 Web 端托管安排里的真题练习任务。",
                        symbol: "doc.text.magnifyingglass",
                        status: practiceStatus,
                        isBusy: actionInFlight == "practice",
                        onAction: { Task { await runPracticeAction() } }
                    )
                }

                if let article = overview?.recommendedArticle {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("推荐文章", systemImage: "sparkles")
                            .font(.title2.weight(.bold))
                        Text(article.title)
                            .font(.title3.weight(.semibold))
                        Text("\(article.year) · Text \(article.textNo)")
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .arkCard()
                }

                HStack(alignment: .top, spacing: 18) {
                    ERCArticleLibraryPanel(
                        articles: articles,
                        selectedArticleId: selectedArticleId,
                        onSelect: { article in
                            selectedArticleId = article.articleId
                            Task { await loadArticle(article.articleId) }
                        }
                    )
                        .frame(width: 380)

                    VStack(spacing: 18) {
                        ERCReviewWorkbench(
                            reviewNext: reviewNext,
                            selectedOption: selectedOption,
                            result: reviewResult,
                            isSubmitting: isSubmittingReview,
                            onSelect: { option in
                                selectedOption = option
                            },
                            onSubmit: {
                                Task { await submitReviewAnswer() }
                            },
                            onNext: {
                                Task { await loadReviewNext() }
                            }
                        )

                        ERCPracticeWorkbench(
                            article: articleDetail,
                            answers: practiceAnswers,
                            isLoading: isLoadingArticle,
                            onSelect: { questionId, option in
                                practiceAnswers[questionId] = option
                            }
                        )
                    }
                    .frame(maxWidth: .infinity)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .arkCard()
                }
            }
            .padding(28)
        }
        .navigationTitle("ERC")
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
            async let overviewResponse: ERCOverview = session.api.get("/api/erc/overview", token: token)
            async let reviewResponse: AppTaskStatus = session.api.get("/todo/app-tasks/erc/status", token: token)
            async let practiceResponse: AppTaskStatus = session.api.get("/todo/app-tasks/erc-practice/status", token: token)
            async let articleResponse: [ERCArticleListItem] = session.api.get("/api/erc/articles", token: token)
            async let reviewNextResponse: ERCReviewNext = session.api.get("/api/erc/review/next", token: token)
            let loadedOverview = try? await overviewResponse
            let loadedArticles = (try? await articleResponse) ?? []
            overview = loadedOverview
            reviewStatus = try? await reviewResponse
            practiceStatus = try? await practiceResponse
            articles = loadedArticles
            reviewNext = try? await reviewNextResponse
            selectedOption = nil
            reviewResult = nil
            reviewStartedAt = Date()

            let preferredArticleId = selectedArticleId ?? loadedOverview?.recommendedArticle?.articleId ?? loadedArticles.first?.articleId
            if let preferredArticleId {
                selectedArticleId = preferredArticleId
                await loadArticle(preferredArticleId)
            }
        }
    }

    private func loadArticle(_ articleId: String) async {
        guard let token = session.token else { return }
        isLoadingArticle = true
        errorMessage = nil
        practiceAnswers = [:]
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
        selectedOption = nil
        reviewResult = nil

        do {
            reviewNext = try await session.api.get("/api/erc/review/next", token: token)
            reviewStartedAt = Date()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func submitReviewAnswer() async {
        guard let token = session.token, let question = reviewNext?.question, let selectedOption else { return }
        isSubmittingReview = true
        errorMessage = nil
        defer { isSubmittingReview = false }

        do {
            let payload = ERCReviewSubmitPayload(
                questionId: question.questionId,
                chosenOption: selectedOption,
                timeSpentMs: max(0, Int(Date().timeIntervalSince(reviewStartedAt) * 1000))
            )
            reviewResult = try await session.api.post("/api/erc/review/submit", token: token, body: payload)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func runReviewAction() async {
        guard let token = session.token else { return }
        actionInFlight = "review"
        errorMessage = nil
        defer { actionInFlight = nil }

        do {
            if reviewStatus?.state == "ready", let taskId = reviewStatus?.taskId {
                let _: EmptyResponse = try await session.api.post("/todo/tasks/\(taskId)/focus/start", token: token)
            } else {
                let payload = ERCAppTaskInitPayload(
                    reviewScope: "due",
                    dailyQuestionTarget: 20,
                    defaultFocusDuration: 1500,
                    addToTodayPlan: true
                )
                reviewStatus = try await session.api.post("/todo/app-tasks/erc/init", token: token, body: payload)
            }

            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func runPracticeAction() async {
        guard let token = session.token else { return }
        actionInFlight = "practice"
        errorMessage = nil
        defer { actionInFlight = nil }

        do {
            if practiceStatus?.state == "ready", let taskId = practiceStatus?.taskId {
                let _: EmptyResponse = try await session.api.post("/todo/tasks/\(taskId)/focus/start", token: token)
            } else {
                let payload = ERCPracticeAppTaskInitPayload(
                    defaultFocusDuration: 1500,
                    addToTodayPlan: true,
                    dailyArticleTarget: 1
                )
                practiceStatus = try await session.api.post("/todo/app-tasks/erc-practice/init", token: token, body: payload)
            }

            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct ERCArticleLibraryPanel: View {
    let articles: [ERCArticleListItem]
    let selectedArticleId: String?
    let onSelect: (ERCArticleListItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Label("题库", systemImage: "books.vertical")
                    .font(.title2.weight(.bold))
                Spacer()
                Text("\(articles.count)")
                    .font(.headline)
                    .foregroundStyle(.secondary)
            }

            if articles.isEmpty {
                ContentUnavailableView("等待题库", systemImage: "doc.text", description: Text("后端返回真题文章后会显示在这里。"))
                    .frame(maxWidth: .infinity, minHeight: 240)
            } else {
                ForEach(articles.prefix(6)) { article in
                    Button {
                        onSelect(article)
                    } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text("\(article.year) Text \(article.textNo)")
                                    .font(.headline)
                                Spacer()
                                Text(article.statusLabel)
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(article.statusTint)
                            }
                            Text(article.title)
                                .font(.callout)
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                            HStack(spacing: 12) {
                                Label("\(article.questionCount ?? 0) 题", systemImage: "checklist")
                                Label("\(article.mistakeCount ?? 0) 错题", systemImage: "exclamationmark.circle")
                            }
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .stroke(selectedArticleId == article.articleId ? ArkTheme.accent : .clear, lineWidth: 2)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .arkCard()
    }
}

private struct ERCPracticeWorkbench: View {
    let article: ERCArticleDetail?
    let answers: [String: String]
    let isLoading: Bool
    let onSelect: (String, String) -> Void

    private let optionKeys = ["A", "B", "C", "D"]

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 6) {
                    Text("整篇练习")
                        .font(.title2.weight(.bold))
                    Text(article.map { "\($0.year) Text \($0.textNo) · \($0.exam)" } ?? "选择一篇真题后开始阅读。")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if let article {
                    Text("\(answers.count) / \(article.questions.count)")
                        .font(.headline)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(.thinMaterial, in: Capsule())
                }
            }

            if isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 260)
            } else if let article {
                HStack(alignment: .top, spacing: 16) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            ForEach(article.paragraphs) { paragraph in
                                HStack(alignment: .top, spacing: 12) {
                                    Text("\(paragraph.paragraphNo)")
                                        .font(.caption.weight(.bold))
                                        .foregroundStyle(.secondary)
                                        .frame(width: 24, alignment: .trailing)
                                    Text(paragraph.text)
                                        .font(.callout)
                                        .lineSpacing(5)
                                }
                            }
                        }
                    }
                    .frame(minHeight: 360, maxHeight: 520)
                    .padding(16)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                    ScrollView {
                        VStack(alignment: .leading, spacing: 14) {
                            if let vocab = article.vocabularySummary, vocab.totalWordCount > 0 {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("词汇预热 \(Int((vocab.masteryRate * 100).rounded()))% 已掌握")
                                        .font(.headline)
                                    Text("预计生词 \(vocab.unfamiliarCount) / \(vocab.totalWordCount)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    if !vocab.previewWords.isEmpty {
                                        Text(vocab.previewWords.prefix(5).map(\.word).joined(separator: " · "))
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(2)
                                    }
                                }
                                .padding(14)
                                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
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
                                                        .frame(width: 28, height: 28)
                                                        .background((answers[question.questionId] == key ? ArkTheme.accent : .gray), in: Circle())
                                                        .foregroundStyle(.white)
                                                    Text(option)
                                                        .font(.callout)
                                                        .multilineTextAlignment(.leading)
                                                    Spacer(minLength: 0)
                                                }
                                            }
                                            .buttonStyle(.bordered)
                                            .tint(answers[question.questionId] == key ? ArkTheme.accent : .secondary)
                                        }
                                    }
                                }
                                .padding(14)
                                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            }
                        }
                    }
                    .frame(width: 430)
                    .frame(minHeight: 360, maxHeight: 520)
                }

                Text("提交整篇会写入练习记录；iPad 端先只做阅读和本地选择，提交结果下一步接确认流程。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                ContentUnavailableView("等待文章", systemImage: "doc.text.magnifyingglass", description: Text("从左侧题库选择一篇真题。"))
                    .frame(maxWidth: .infinity, minHeight: 280)
            }
        }
        .arkCard()
    }
}

private struct ERCReviewWorkbench: View {
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
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("ERC Review")
                        .font(.title2.weight(.bold))
                    Text(articleTitle)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if let question = reviewNext?.question {
                    Text("Q\(question.questionNo)")
                        .font(.headline)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(.thinMaterial, in: Capsule())
                }
            }

            if let reviewNext, reviewNext.hasItem, let question = reviewNext.question {
                VStack(alignment: .leading, spacing: 16) {
                    Text(question.stem)
                        .font(.title3.weight(.semibold))
                        .lineSpacing(4)

                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 2), spacing: 12) {
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
                                    .frame(maxWidth: .infinity, minHeight: 74, alignment: .topLeading)
                                }
                                .buttonStyle(.bordered)
                                .tint(optionTint(key))
                                .disabled(result != nil)
                            }
                        }
                    }

                    HStack {
                        if let result {
                            Label(
                                result.isCorrect ? "答对了" : "正确答案 \(result.correctOption)",
                                systemImage: result.isCorrect ? "checkmark.circle.fill" : "xmark.circle.fill"
                            )
                            .foregroundStyle(result.isCorrect ? ArkTheme.success : .red)
                            .font(.headline)
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

                    if !reviewNext.paragraphs.isEmpty {
                        ScrollView {
                            VStack(alignment: .leading, spacing: 12) {
                                ForEach(reviewNext.paragraphs.prefix(1)) { paragraph in
                                    HStack(alignment: .top, spacing: 12) {
                                        Text("\(paragraph.paragraphNo)")
                                            .font(.caption.weight(.bold))
                                            .foregroundStyle(.secondary)
                                            .frame(width: 24, alignment: .trailing)
                                        Text(paragraph.text)
                                            .font(.caption)
                                            .lineSpacing(3)
                                    }
                                }
                            }
                        }
                        .frame(maxHeight: 110)
                        .padding(14)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                }
            } else if reviewNext?.hasItem == false {
                VStack(spacing: 14) {
                    Image(systemName: "checkmark.seal")
                        .font(.system(size: 44, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Text("暂无到期复习")
                        .font(.title3.weight(.bold))
                    Text("Web 端也会在没有到期题时进入完成/加练状态。")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    Button {
                        onNext()
                    } label: {
                        Label("刷新复习题", systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(.bordered)
                }
                .frame(maxWidth: .infinity, minHeight: 340)
            } else {
                ContentUnavailableView("正在读取复习题", systemImage: "doc.text.magnifyingglass")
                    .frame(maxWidth: .infinity, minHeight: 340)
            }
        }
        .arkCard()
    }

    private var articleTitle: String {
        guard let article = reviewNext?.article else {
            return "读取下一道到期复习题。"
        }
        return "\(article.year) Text \(article.textNo) · \(article.title)"
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
            return .gray
        }
        return selectedOption == key ? ArkTheme.accent : .gray
    }
}

private struct ERCManagedTaskCard: View {
    let title: String
    let subtitle: String
    let symbol: String
    let status: AppTaskStatus?
    let isBusy: Bool
    let onAction: () -> Void

    private var actionTitle: String {
        switch status?.state {
        case "ready": "开始"
        case "completed_today": "今日已完成"
        case "no_primary_event": "缺少主事件"
        case "uninitialized", "event_not_configured", "config_invalid", nil: "初始化"
        default: "查看状态"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Image(systemName: symbol)
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(ArkTheme.accent)
                    .frame(width: 46, height: 46)
                    .background(ArkTheme.accent.opacity(0.12), in: Circle())

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.title3.weight(.bold))
                    Text(ercStatusDescription(status?.state))
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }

            Text(subtitle)
                .font(.callout)
                .foregroundStyle(.secondary)
                .lineLimit(2)

            if let blockedReason = status?.blockedReason {
                Text(blockedReason)
                    .font(.caption)
                    .foregroundStyle(.orange)
            }

            Button(action: onAction) {
                if isBusy {
                    ProgressView()
                } else {
                    Label(actionTitle, systemImage: status?.state == "ready" ? "play.fill" : "wand.and.stars")
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(isBusy || status?.state == "completed_today" || status?.state == "no_primary_event")
        }
        .frame(maxWidth: .infinity, minHeight: 220, alignment: .topLeading)
        .arkCard()
    }
}

private func ercStatusDescription(_ state: String?) -> String {
    switch state {
    case "ready": "任务已就绪"
    case "completed_today": "今日已完成"
    case "uninitialized": "尚未初始化"
    case "event_not_configured": "当前事件未配置"
    case "config_invalid": "配置需要修复"
    case "no_primary_event": "没有主事件"
    case "blocked": "暂不可用"
    default: "正在读取状态"
    }
}

private extension ERCArticleListItem {
    var statusLabel: String {
        switch status {
        case "practiced": "已练"
        case "has_due_review": "待复习"
        case "unstarted": "未开始"
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
