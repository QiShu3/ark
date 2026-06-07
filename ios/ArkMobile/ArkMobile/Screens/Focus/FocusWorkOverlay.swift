import SwiftUI

struct FocusWorkOverlay: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.scenePhase) private var scenePhase
    @State private var workflow: FocusWorkflow?
    @State private var isBusy = false
    @State private var errorMessage: String?
    @State private var pendingAbandonFocusWorkType: String?
    @State private var timerNow = Date()

    private let liveTimer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    private let refreshTimer = Timer.publish(every: 2, on: .main, in: .common).autoconnect()

    private var shouldShow: Bool {
        workflow?.state == "focus"
            && workflow?.focusWorkDisplayState == "fullscreen"
            && workflow?.activeFocusWorkType != nil
    }

    var body: some View {
        Group {
            if shouldShow, let workflow, let focusWorkType = workflow.activeFocusWorkType {
                let definition = FocusWorkRegistry.definition(for: focusWorkType)
                ZStack {
                    LinearGradient(
                        colors: [
                            Color(red: 0.92, green: 0.96, blue: 1.0),
                            Color(red: 0.98, green: 0.98, blue: 1.0)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    .ignoresSafeArea()

                    VStack(spacing: 18) {
                        FocusWorkOverlayHeader(
                            workflow: workflow,
                            title: definition.title,
                            subtitle: definition.subtitle,
                            timerText: overlayTimerText(workflow.liveTimerSeconds(now: timerNow)),
                            isBusy: isBusy,
                            onPauseResume: { Task { await togglePause() } },
                            onAbandon: { pendingAbandonFocusWorkType = focusWorkType },
                            onCompleteRound: { Task { await completeCurrentFocusRound(focusWorkType: focusWorkType) } }
                        )

                        ZStack {
                            definition.render(workflow, focusWorkRuntimeActions)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .opacity(workflow.isPaused == true ? 0.35 : 1)
                                .allowsHitTesting(workflow.isPaused != true)

                            if workflow.isPaused == true {
                                PauseOverlayCard()
                            }
                        }
                    }
                    .padding(24)

                    if let errorMessage {
                        VStack {
                            Spacer()
                            Text(errorMessage)
                                .font(.callout)
                                .foregroundStyle(.red)
                                .padding()
                                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        }
                        .padding(.bottom, 26)
                    }
                }
                .transition(.opacity.combined(with: .scale(scale: 0.98)))
                .zIndex(100)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: shouldShow)
        .task(id: session.token) {
            await load()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await load() }
        }
        .onReceive(refreshTimer) { _ in
            Task { await load() }
        }
        .onReceive(liveTimer) { value in
            timerNow = value
        }
        .confirmationDialog(
            "确定要放弃当前专注阶段吗？这只会结束当前阶段，不会结束整个工作流。",
            isPresented: Binding(
                get: { pendingAbandonFocusWorkType != nil },
                set: { isPresented in
                    if !isPresented {
                        pendingAbandonFocusWorkType = nil
                    }
                }
            ),
            titleVisibility: .visible
        ) {
            Button("放弃本阶段", role: .destructive) {
                guard let focusWorkType = pendingAbandonFocusWorkType else { return }
                pendingAbandonFocusWorkType = nil
                Task { await abandonCurrentFocus(focusWorkType: focusWorkType) }
            }
            Button("继续专注", role: .cancel) {
                pendingAbandonFocusWorkType = nil
            }
        }
    }

    private var focusWorkRuntimeActions: FocusWorkRuntimeActions {
        FocusWorkRuntimeActions(
            completeTaskAndFinish: { await completeTaskAndFinishCurrentFocus() },
            stopFocus: { await stopFocus() }
        )
    }

    private func load() async {
        guard let token = session.token else { return }
        do {
            let snapshot: FocusWorkflow = try await session.api.get("/todo/focus/workflow/current", token: token)
            apply(snapshot)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func apply(_ snapshot: FocusWorkflow) {
        if snapshot.state == "focus",
           snapshot.focusWorkDisplayState == "fullscreen",
           snapshot.activeFocusWorkType != nil {
            workflow = snapshot
        } else {
            self.workflow = nil
        }
    }

    private func notifyWorkflowDidChange() {
        NotificationCenter.default.post(name: .arkFocusWorkflowDidChange, object: nil)
    }

    private func togglePause() async {
        guard let token = session.token else { return }
        isBusy = true
        defer { isBusy = false }

        do {
            let path = workflow?.isPaused == true ? "/todo/focus/workflow/resume" : "/todo/focus/workflow/pause"
            let snapshot: FocusWorkflow = try await session.api.post(path, token: token)
            apply(snapshot)
            notifyWorkflowDidChange()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func completeCurrentFocusRound(focusWorkType: String) async {
        guard let token = session.token else { return }
        isBusy = true
        defer { isBusy = false }

        do {
            let payload = FocusWorkResultPayload(
                focusWorkType: focusWorkType,
                result: "completed",
                progressSnapshot: ["completedTask": .bool(false)]
            )
            let snapshot: FocusWorkflow = try await session.api.post(
                "/todo/focus/workflow/focus-work-result",
                token: token,
                body: payload
            )
            apply(snapshot)
            snapshot.notifyCompletionIfNeeded()
            notifyWorkflowDidChange()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func abandonCurrentFocus(focusWorkType: String) async {
        guard let token = session.token else { return }
        isBusy = true
        defer { isBusy = false }

        do {
            let payload = FocusWorkResultPayload(
                focusWorkType: focusWorkType,
                result: "abandoned",
                progressSnapshot: [:]
            )
            let snapshot: FocusWorkflow = try await session.api.post(
                "/todo/focus/workflow/focus-work-result",
                token: token,
                body: payload
            )
            apply(snapshot)
            snapshot.notifyCompletionIfNeeded()
            notifyWorkflowDidChange()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @discardableResult
    private func completeTaskAndFinishCurrentFocus() async -> Bool {
        guard let token = session.token, let workflow, let focusWorkType = workflow.activeFocusWorkType else { return false }
        isBusy = true
        defer { isBusy = false }

        do {
            if workflow.activeFocusWorkType == "task_focus",
               (workflow.activeTaskSourceType ?? "user") == "user",
               let taskId = workflow.taskId {
                let _: ArkTask = try await session.api.post("/todo/tasks/\(taskId)/complete", token: token)
            }

            do {
                let snapshot = try await submitCompletedFocusWorkResult(token: token, workflow: workflow, focusWorkType: focusWorkType, completedTask: true)
                snapshot.notifyCompletionIfNeeded()
            } catch APIError.http(_, let message) where message.contains("完成上限") {
                let snapshot = try await submitCompletedFocusWorkResult(token: token, workflow: workflow, focusWorkType: focusWorkType, completedTask: false)
                snapshot.notifyCompletionIfNeeded()
            }
            self.workflow = nil
            do {
                let _: EmptyResponse = try await session.api.post("/todo/focus/stop", token: token)
            } catch {
                errorMessage = error.localizedDescription
            }
            await load()
            notifyWorkflowDidChange()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    private func submitCompletedFocusWorkResult(
        token: String,
        workflow: FocusWorkflow,
        focusWorkType: String,
        completedTask: Bool
    ) async throws -> FocusWorkflow {
        var progressSnapshot: [String: JSONValue] = ["completedTask": .bool(completedTask)]
        progressSnapshot["taskId"] = workflow.taskId.map(JSONValue.string) ?? .null
        progressSnapshot["appTaskType"] = workflow.activeTaskAppTaskType.map(JSONValue.string) ?? .null

        let payload = FocusWorkResultPayload(
            focusWorkType: focusWorkType,
            result: "completed",
            progressSnapshot: progressSnapshot
        )
        return try await session.api.post("/todo/focus/workflow/focus-work-result", token: token, body: payload)
    }

    private func stopFocus() async {
        guard let token = session.token else { return }
        isBusy = true
        defer { isBusy = false }

        do {
            let _: EmptyResponse = try await session.api.post("/todo/focus/stop", token: token)
            workflow = nil
            notifyWorkflowDidChange()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func overlayTimerText(_ seconds: Int) -> String {
        let safeSeconds = max(0, seconds)
        let minutes = safeSeconds / 60
        let restSeconds = safeSeconds % 60
        return String(format: "%02d:%02d", minutes, restSeconds)
    }
}

struct ERCReviewFocusWorkContent: View {
    @EnvironmentObject private var session: AppSession
    let isPaused: Bool
    let onCompleteTaskAndFinish: () async -> Bool
    let onStopFocus: () async -> Void

    @State private var item: ERCReviewNext?
    @State private var selectedOption: String?
    @State private var result: ERCReviewSubmitResult?
    @State private var isLoading = false
    @State private var isLoadingAgain = false
    @State private var isSubmitting = false
    @State private var isFinishing = false
    @State private var showFinishModal = false
    @State private var errorMessage: String?
    @State private var answeredCount = 0
    @State private var isExtraPractice = false
    @State private var startedAt = Date()

    private let optionKeys = ["A", "B", "C", "D"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header

                if let errorMessage {
                    Text(errorMessage)
                        .font(.callout)
                        .foregroundStyle(.red)
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                }

                if isLoading {
                    ProgressView("复习题加载中...")
                        .frame(maxWidth: .infinity, minHeight: 420)
                } else if let item, item.hasItem == false {
                    emptyReviewPanel
                } else if let item, let question = item.question {
                    HStack(alignment: .top, spacing: 16) {
                        readingPassage(item)
                            .frame(maxWidth: .infinity, minHeight: 560, maxHeight: 640)
                        questionPanel(question)
                            .frame(width: 480)
                    }
                } else {
                    Text("复习题加载中...")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, minHeight: 420)
                }
            }
            .frame(maxWidth: 1180)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 8)
            .padding(.bottom, 24)
        }
        .task {
            await loadNext()
        }
        .sheet(isPresented: $showFinishModal) {
            ERCReviewFinishSheet(
                isFinishing: isFinishing,
                onCancel: { showFinishModal = false },
                onConfirm: {
                    Task { await completeTodayReview() }
                }
            )
            .presentationDetents([.height(360)])
            .presentationDragIndicator(.visible)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("ERC REVIEW")
                .font(.system(size: 38, weight: .heavy, design: .serif))
            if let article = item?.article {
                HStack(spacing: 10) {
                    Text("\(article.year) 年 Text \(article.textNo)")
                    if !article.title.isEmpty {
                        Text(article.title)
                    }
                    Label("模式：\(isExtraPractice ? "加练复习" : "今日复习")", systemImage: "chart.bar")
                }
                .font(.callout.weight(.semibold))
                .foregroundStyle(.secondary)
            } else {
                Label("模式：\(isExtraPractice ? "加练复习" : "今日复习")", systemImage: "chart.bar")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var emptyReviewPanel: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("暂无到期复习")
                .font(.title2.weight(.bold))
            Text(isExtraPractice ? "加练已结束。" : "今天没有需要复习的阅读题，点击下方按钮完成今日学习任务吧！")
                .font(.callout)
                .foregroundStyle(.secondary)

            HStack(spacing: 12) {
                if isExtraPractice {
                    Button {
                        Task { await onStopFocus() }
                    } label: {
                        Label("结束本轮专注", systemImage: "checkmark.circle.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(isPaused || isLoading || isFinishing)
                } else if answeredCount > 0 {
                    Button {
                        showFinishModal = true
                    } label: {
                        Label("完成今日 ERC 复习", systemImage: "checkmark.circle.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(isPaused || isFinishing)
                } else {
                    Button {
                        Task { await onStopFocus() }
                    } label: {
                        Label("结束并完成今日任务", systemImage: "checkmark.circle.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(isPaused || isLoading || isFinishing)
                }

                Button {
                    Task { await loadRandomQuestion() }
                } label: {
                    Label(isLoadingAgain ? "正在加载..." : "再来一次", systemImage: "arrow.triangle.2.circlepath")
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .disabled(isPaused || isLoadingAgain || isLoading)
            }
        }
        .padding(28)
        .frame(maxWidth: .infinity, minHeight: 420, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.45), lineWidth: 1)
        }
    }

    private func readingPassage(_ item: ERCReviewNext) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Reading Passage", systemImage: "book.pages")
                .font(.title2.weight(.bold))
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    ForEach(item.paragraphs) { paragraph in
                        HStack(alignment: .top, spacing: 14) {
                            Text("\(paragraph.paragraphNo)")
                                .font(.headline.weight(.bold))
                                .foregroundStyle(.secondary)
                                .frame(width: 28, alignment: .trailing)
                            Text(paragraph.text)
                                .font(.system(.body, design: .serif))
                                .lineSpacing(6)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
                .padding(.trailing, 8)
            }
        }
        .padding(24)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.45), lineWidth: 1)
        }
    }

    private func questionPanel(_ question: ERCQuestion) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Current Question")
                        .font(.title3.weight(.bold))
                    Text("Q\(question.questionNo)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button {
                    Task { await submit(question) }
                } label: {
                    Text("提交答案")
                }
                .buttonStyle(.borderedProminent)
                .disabled(isPaused || selectedOption == nil || result != nil || isSubmitting)
            }

            Text(question.stem)
                .font(.headline)
                .lineSpacing(4)

            VStack(spacing: 10) {
                ForEach(optionKeys, id: \.self) { key in
                    if let option = question.options[key] {
                        ERCReviewOptionButton(
                            key: key,
                            text: option,
                            selected: selectedOption == key,
                            correct: result?.correctOption == key,
                            wrongSelection: result != nil && selectedOption == key && result?.correctOption != key,
                            disabled: isPaused || result != nil
                        ) {
                            selectedOption = key
                        }
                    }
                }
            }

            if let result {
                VStack(alignment: .leading, spacing: 10) {
                    Label(result.isCorrect ? "回答正确" : "回答错误", systemImage: result.isCorrect ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .font(.headline)
                        .foregroundStyle(result.isCorrect ? ArkTheme.success : .red)
                    Text("正确答案：\(result.correctOption)")
                        .font(.callout.weight(.semibold))
                    Button {
                        Task {
                            if isExtraPractice {
                                await loadRandomQuestion()
                            } else {
                                await loadNext()
                            }
                        }
                    } label: {
                        Label("下一题", systemImage: "chevron.right")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .disabled(isPaused)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
        }
        .padding(22)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.45), lineWidth: 1)
        }
    }

    private func loadNext() async {
        guard let token = session.token else { return }
        isLoading = true
        errorMessage = nil
        selectedOption = nil
        result = nil
        defer { isLoading = false }

        do {
            item = try await session.api.get("/api/erc/review/next", token: token)
            startedAt = Date()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadRandomQuestion() async {
        guard let token = session.token else { return }
        isLoadingAgain = true
        errorMessage = nil
        selectedOption = nil
        result = nil
        defer { isLoadingAgain = false }

        do {
            let articles: [ERCArticleListItem] = try await session.api.get("/api/erc/articles", token: token)
            guard let selectedArticle = articles.randomElement() else {
                throw ArkLocalError(message: "没有找到可复习的真题文章")
            }
            let article: ERCArticleDetail = try await session.api.get(
                "/api/erc/articles/\(selectedArticle.articleId)",
                token: token
            )
            guard let question = article.questions.randomElement() else {
                throw ArkLocalError(message: "该文章没有任何题目")
            }
            item = ERCReviewNext(
                hasItem: true,
                nextDueAt: nil,
                article: ERCRecommendedArticle(
                    articleId: article.articleId,
                    year: article.year,
                    textNo: article.textNo,
                    title: article.title
                ),
                paragraphs: article.paragraphs,
                question: question
            )
            isExtraPractice = true
            startedAt = Date()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func completeTodayReview() async {
        guard !isFinishing else { return }
        isFinishing = true
        defer { isFinishing = false }

        let succeeded = await onCompleteTaskAndFinish()
        if succeeded {
            showFinishModal = false
        }
    }

    private func submit(_ question: ERCQuestion) async {
        guard let token = session.token, let selectedOption else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            let payload = ERCReviewSubmitPayload(
                questionId: question.questionId,
                chosenOption: selectedOption,
                timeSpentMs: max(0, Int(Date().timeIntervalSince(startedAt) * 1000))
            )
            result = try await session.api.post("/api/erc/review/submit", token: token, body: payload)
            answeredCount += 1
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct ERCReviewFinishSheet: View {
    let isFinishing: Bool
    let onCancel: () -> Void
    let onConfirm: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "trophy.fill")
                .font(.system(size: 44, weight: .bold))
                .foregroundStyle(ArkTheme.success)
                .frame(width: 76, height: 76)
                .background(ArkTheme.success.opacity(0.14), in: Circle())

            VStack(spacing: 8) {
                Text("今日复习已圆满完成！")
                    .font(.title3.weight(.bold))
                Text("您已学完今天所有的到期复习题目，\n好习惯成就好成绩，明天继续保持哦！")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
            }

            HStack(spacing: 12) {
                Button {
                    onCancel()
                } label: {
                    Text("再看看")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .disabled(isFinishing)

                Button {
                    onConfirm()
                } label: {
                    Text(isFinishing ? "正在返回..." : "好的，返回")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(isFinishing)
            }
        }
        .padding(28)
    }
}

private struct ArkLocalError: LocalizedError {
    let message: String

    var errorDescription: String? {
        message
    }
}

private struct ERCReviewOptionButton: View {
    let key: String
    let text: String
    let selected: Bool
    let correct: Bool
    let wrongSelection: Bool
    let disabled: Bool
    let onSelect: () -> Void

    private var tint: Color {
        if correct { return ArkTheme.success }
        if wrongSelection { return .red }
        if selected { return ArkTheme.accent }
        return .secondary
    }

    var body: some View {
        Button {
            onSelect()
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Text(key)
                    .font(.headline.weight(.bold))
                    .frame(width: 34, height: 34)
                    .background(tint.opacity(0.18), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .foregroundStyle(tint)
                Text(text)
                    .font(.callout.weight(.medium))
                    .foregroundStyle(.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(14)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(tint.opacity(selected || correct || wrongSelection ? 0.8 : 0.25), lineWidth: selected || correct || wrongSelection ? 2 : 1)
            }
        }
        .buttonStyle(.plain)
        .disabled(disabled)
    }
}

struct ERCPracticeFocusWorkContent: View {
    @EnvironmentObject private var session: AppSession
    let isPaused: Bool
    let onCompleteTaskAndFinish: () async -> Void
    let onStopFocus: () async -> Void

    @State private var article: ERCArticleDetail?
    @State private var preheatWords: [VocabReviewItem] = []
    @State private var preheatIndex = 0
    @State private var preheatRevealed = false
    @State private var answers: [String: String] = [:]
    @State private var currentQuestionIndex = 0
    @State private var submitResult: ERCArticleSubmitResult?
    @State private var isLoading = false
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var startedAt = Date()

    private let optionKeys = ["A", "B", "C", "D"]

    private var currentQuestion: ERCQuestion? {
        guard let article, article.questions.indices.contains(currentQuestionIndex) else { return nil }
        return article.questions[currentQuestionIndex]
    }

    private var currentPreheatWord: VocabReviewItem? {
        guard preheatWords.indices.contains(preheatIndex) else { return nil }
        return preheatWords[preheatIndex]
    }

    private var answeredCount: Int {
        article?.questions.filter { answers[$0.questionId] != nil }.count ?? 0
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header

                if let errorMessage {
                    Text(errorMessage)
                        .font(.callout)
                        .foregroundStyle(.red)
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                }

                if isLoading {
                    ProgressView("正在加载今日推荐真题...")
                        .frame(maxWidth: .infinity, minHeight: 500)
                } else if let article, let currentPreheatWord, submitResult == nil {
                    preheatPanel(article: article, item: currentPreheatWord)
                } else if let article, let submitResult {
                    resultPanel(article: article, result: submitResult)
                } else if let article {
                    HStack(alignment: .top, spacing: 16) {
                        practicePassage(article)
                            .frame(maxWidth: .infinity, minHeight: 580, maxHeight: 680)
                        practiceQuestionPanel(article)
                            .frame(width: 500)
                    }
                } else {
                    emptyPracticePanel
                }
            }
            .frame(maxWidth: 1220)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 8)
            .padding(.bottom, 24)
        }
        .task {
            await loadRecommendedArticle()
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("ERC PRACTICE")
                .font(.system(size: 38, weight: .heavy, design: .serif))
            if let article {
                HStack(spacing: 10) {
                    Text("\(article.year) 年 Text \(article.textNo)")
                    Text(article.exam)
                    Label("\(answeredCount) / \(article.questions.count) 已答", systemImage: "checklist")
                }
                .font(.callout.weight(.semibold))
                .foregroundStyle(.secondary)
            } else {
                Label("真题练习", systemImage: "doc.text.magnifyingglass")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var emptyPracticePanel: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("今日真题练习已完成")
                .font(.title2.weight(.bold))
            Text("太棒了！您今日推荐的真题阅读已经全部完成了。您可以前往题库自行挑选其他的阅读文章，或者完成任务进入专注时间。")
                .font(.callout)
                .foregroundStyle(.secondary)
            Button {
                Task { await onStopFocus() }
            } label: {
                Label("结束并完成今日任务", systemImage: "checkmark.circle.fill")
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(isPaused)

            Button {
                Task { await loadRandomArticle() }
            } label: {
                Label(isLoading ? "正在加载..." : "再来一次", systemImage: "arrow.triangle.2.circlepath")
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .disabled(isPaused || isLoading)
        }
        .padding(28)
        .frame(maxWidth: .infinity, minHeight: 460, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.45), lineWidth: 1)
        }
    }

    private func preheatPanel(article: ERCArticleDetail, item: VocabReviewItem) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Vocabulary Preheat")
                        .font(.caption.weight(.bold))
                        .tracking(3)
                        .foregroundStyle(.secondary)
                    Text("真题词汇预热")
                        .font(.title.weight(.heavy))
                    Text("第 \(preheatIndex + 1) 个 / 共 \(preheatWords.count) 个单词（来自 \(article.year) 年 Text \(article.textNo)）")
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button {
                    preheatWords = []
                    preheatIndex = 0
                    preheatRevealed = false
                    startedAt = Date()
                } label: {
                    Label("跳过词汇预热，直接阅读原文", systemImage: "forward.end")
                }
                .buttonStyle(.bordered)
                .disabled(isPaused)
            }

            VocabFocusWordCard(item: item, revealed: preheatRevealed) {
                preheatRevealed.toggle()
            }

            HStack(spacing: 12) {
                preheatMemoryButton(.again)
                preheatMemoryButton(.hard)
                preheatMemoryButton(.good)
                preheatMemoryButton(.easy)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.45), lineWidth: 1)
        }
    }

    private func preheatMemoryButton(_ result: VocabFocusMemoryResult) -> some View {
        Button {
            Task { await submitPreheat(result) }
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                Label(result.title, systemImage: result.symbol)
                    .font(.headline)
                Text(result.hint)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
        }
        .buttonStyle(.bordered)
        .controlSize(.large)
        .tint(result.tint)
        .disabled(isPaused || isSubmitting)
    }

    private func practicePassage(_ article: ERCArticleDetail) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Label("Reading Passage", systemImage: "book.pages")
                    .font(.title2.weight(.bold))
                Spacer()
                Text(article.title)
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    ForEach(article.paragraphs) { paragraph in
                        HStack(alignment: .top, spacing: 14) {
                            Text("\(paragraph.paragraphNo)")
                                .font(.headline.weight(.bold))
                                .foregroundStyle(.secondary)
                                .frame(width: 28, alignment: .trailing)
                            Text(paragraph.text)
                                .font(.system(.body, design: .serif))
                                .lineSpacing(6)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
                .padding(.trailing, 8)
            }
        }
        .padding(24)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.45), lineWidth: 1)
        }
    }

    private func practiceQuestionPanel(_ article: ERCArticleDetail) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Current Question")
                        .font(.title3.weight(.bold))
                    Text("题目 \(currentQuestionIndex + 1) / \(article.questions.count)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button {
                    Task { await submitArticle(article) }
                } label: {
                    Text(isSubmitting ? "提交中..." : "提交答案")
                }
                .buttonStyle(.borderedProminent)
                .disabled(isPaused || isSubmitting || answeredCount < article.questions.count)
            }

            ProgressView(value: Double(currentQuestionIndex + 1), total: Double(max(article.questions.count, 1)))
                .tint(ArkTheme.accent)

            if let question = currentQuestion {
                Text(question.stem)
                    .font(.headline)
                    .lineSpacing(4)

                VStack(spacing: 10) {
                    ForEach(optionKeys, id: \.self) { key in
                        if let option = question.options[key] {
                            ERCPracticeOptionButton(
                                key: key,
                                text: option,
                                selected: answers[question.questionId] == key,
                                disabled: isPaused
                            ) {
                                answers[question.questionId] = key
                            }
                        }
                    }
                }
            }

            HStack {
                Button {
                    currentQuestionIndex = max(0, currentQuestionIndex - 1)
                } label: {
                    Label("上一题", systemImage: "chevron.left")
                }
                .buttonStyle(.bordered)
                .disabled(currentQuestionIndex == 0)

                Spacer()

                Button {
                    currentQuestionIndex = min(article.questions.count - 1, currentQuestionIndex + 1)
                } label: {
                    Label("下一题", systemImage: "chevron.right")
                }
                .buttonStyle(.bordered)
                .disabled(currentQuestionIndex >= article.questions.count - 1)
            }
        }
        .padding(22)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.45), lineWidth: 1)
        }
    }

    private func resultPanel(article: ERCArticleDetail, result: ERCArticleSubmitResult) -> some View {
        HStack(alignment: .top, spacing: 16) {
            practicePassage(article)
                .frame(maxWidth: .infinity, minHeight: 580, maxHeight: 680)

            VStack(alignment: .leading, spacing: 16) {
                Text("Attempt Summary")
                    .font(.title3.weight(.bold))
                Text("\(result.correctCount) / \(result.questionCount) 正确")
                    .font(.system(size: 44, weight: .heavy, design: .rounded))
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(result.items) { item in
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Q\(item.questionNo)")
                                    .font(.headline)
                                HStack {
                                    Label("选择 \(item.chosenOption)", systemImage: item.isCorrect ? "checkmark.circle" : "xmark.circle")
                                        .foregroundStyle(item.isCorrect ? ArkTheme.success : .red)
                                    Spacer()
                                    Text("答案 \(item.correctOption)")
                                        .font(.callout.weight(.semibold))
                                }
                            }
                            .padding(12)
                            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                    }
                }
                Text("可通过顶部按钮完成当前阶段。")
                    .font(.callout)
                    .foregroundStyle(.secondary)

                Button {
                    Task { await onCompleteTaskAndFinish() }
                } label: {
                    Label("标记今日真题任务为已完成", systemImage: "checkmark.circle.fill")
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(isPaused)
            }
            .padding(22)
            .frame(width: 500)
            .frame(minHeight: 580, maxHeight: 680, alignment: .topLeading)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .stroke(.white.opacity(0.45), lineWidth: 1)
            }
        }
    }

    private func loadRecommendedArticle() async {
        guard let token = session.token else { return }
        isLoading = true
        errorMessage = nil
        submitResult = nil
        defer { isLoading = false }

        do {
            let overview: ERCOverview = try await session.api.get("/api/erc/overview", token: token)
            guard let articleId = overview.recommendedArticle?.articleId else {
                article = nil
                return
            }
            try await loadArticle(articleId: articleId, token: token)
            answers = [:]
            currentQuestionIndex = 0
            startedAt = Date()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadRandomArticle() async {
        guard let token = session.token else { return }
        isLoading = true
        errorMessage = nil
        submitResult = nil
        defer { isLoading = false }

        do {
            let articles: [ERCArticleListItem] = try await session.api.get("/api/erc/articles", token: token)
            guard let selected = articles.randomElement() else {
                article = nil
                errorMessage = "没有找到可练习的真题文章"
                return
            }
            try await loadArticle(articleId: selected.articleId, token: token)
            answers = [:]
            currentQuestionIndex = 0
            startedAt = Date()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadArticle(articleId: String, token: String) async throws {
        async let articleResponse: ERCArticleDetail = session.api.get("/api/erc/articles/\(articleId)", token: token)
        async let preheatResponse: [VocabReviewItem] = session.api.get("/api/erc/articles/\(articleId)/vocabulary/preheat", token: token)

        article = try await articleResponse
        preheatWords = (try? await preheatResponse) ?? []
        preheatIndex = 0
        preheatRevealed = false
    }

    private func submitPreheat(_ result: VocabFocusMemoryResult) async {
        guard let token = session.token, let article, let item = currentPreheatWord else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            let payload = ERCVocabularyPreheatSubmitPayload(
                deckId: item.deckId,
                wordId: item.id,
                result: result.rawValue,
                promptType: item.promptType
            )
            let _: VocabReviewSubmitResult = try await session.api.post(
                "/api/erc/articles/\(article.articleId)/vocabulary/reviews",
                token: token,
                body: payload
            )
            preheatRevealed = false
            if preheatIndex + 1 < preheatWords.count {
                preheatIndex += 1
            } else {
                preheatWords = []
                preheatIndex = 0
                startedAt = Date()
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func submitArticle(_ article: ERCArticleDetail) async {
        guard let token = session.token else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            let payload = ERCArticleSubmitPayload(
                answers: article.questions.compactMap { question in
                    guard let answer = answers[question.questionId] else { return nil }
                    return ERCPracticeAnswer(questionId: question.questionId, chosenOption: answer)
                },
                timeSpentMs: max(0, Int(Date().timeIntervalSince(startedAt) * 1000))
            )
            submitResult = try await session.api.post("/api/erc/articles/\(article.articleId)/submit", token: token, body: payload)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct ERCPracticeOptionButton: View {
    let key: String
    let text: String
    let selected: Bool
    let disabled: Bool
    let onSelect: () -> Void

    var body: some View {
        Button {
            onSelect()
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Text(key)
                    .font(.headline.weight(.bold))
                    .frame(width: 34, height: 34)
                    .background((selected ? ArkTheme.accent : Color.secondary).opacity(0.18), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .foregroundStyle(selected ? ArkTheme.accent : .secondary)
                Text(text)
                    .font(.callout.weight(.medium))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(14)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke((selected ? ArkTheme.accent : Color.secondary).opacity(selected ? 0.85 : 0.25), lineWidth: selected ? 2 : 1)
            }
        }
        .buttonStyle(.plain)
        .disabled(disabled)
    }
}

struct VocabFocusWorkContent: View {
    @EnvironmentObject private var session: AppSession
    let isPaused: Bool
    let onCompleteTaskAndFinish: () async -> Bool
    let onStopFocus: () async -> Void

    @State private var decks: [VocabDeck] = []
    @State private var selectedDeckId: String?
    @State private var todaySummary: VocabTodaySummary?
    @State private var learningQueue: [VocabReviewItem] = []
    @State private var reviewQueue: [VocabReviewItem] = []
    @State private var studyQueue: [VocabReviewItem] = []
    @State private var extraQueue: [VocabReviewItem] = []
    @State private var extraIndex = 0
    @State private var isExtraPractice = false
    @State private var revealed = false
    @State private var lastResult: VocabReviewSubmitResult?
    @State private var cardStartedAt = Date()
    @State private var isLoading = false
    @State private var isSubmitting = false
    @State private var isLoadingExtra = false
    @State private var isBatchReview = false
    @State private var completedBatchWordIds: [String] = []
    @State private var completedSessionWordIds: [String] = []
    @State private var initialCompletedCount = 0
    @State private var errorMessage: String?
    @State private var hasLoadedInitialContent = false
    @State private var didCompleteTodayFocus = false

    private let batchReviewSize = 10

    private var primaryDeck: VocabDeck? {
        decks.first { $0.id == selectedDeckId } ?? decks.first
    }

    private var currentItem: VocabReviewItem? {
        if isExtraPractice {
            guard extraQueue.indices.contains(extraIndex) else { return nil }
            return extraQueue[extraIndex]
        }
        return learningQueue.first ?? reviewQueue.first ?? studyQueue.first
    }

    private var currentQueueCount: Int {
        if isExtraPractice {
            return max(0, extraQueue.count - extraIndex)
        }
        return learningQueue.count + reviewQueue.count + studyQueue.count
    }

    private var totalBatchCount: Int {
        guard let totalCount = todaySummary?.totalCount, totalCount > 0 else { return 1 }
        return max(1, Int(ceil(Double(totalCount) / Double(batchReviewSize))))
    }

    private var completedTodayCount: Int {
        initialCompletedCount + completedSessionWordIds.count
    }

    private var currentBatchNumber: Int {
        let base = isBatchReview && !completedBatchWordIds.isEmpty ? max(completedTodayCount - 1, 0) : completedTodayCount
        return min((base / batchReviewSize) + 1, totalBatchCount)
    }

    private var hasCompletedTodayPlan: Bool {
        guard let totalCount = todaySummary?.totalCount, totalCount > 0 else { return false }
        return completedTodayCount >= totalCount
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                focusProgressHeader

                if isLoading {
                    loadingPanel("今日单词加载中...")
                } else if let errorMessage {
                    messagePanel(title: "加载失败", message: errorMessage)
                } else if isExtraPractice {
                    extraPracticeContent
                } else if hasCompletedTodayPlan && currentItem == nil {
                    Text("先完成今天这一个词，再进入下一步。")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)

                    completePanel
                } else if isBatchReview || (!completedBatchWordIds.isEmpty && currentItem == nil) {
                    batchReviewPanel
                } else if let currentItem {
                    Text("先完成今天这一个词，再进入下一步。")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)

                    VocabFocusWordCard(item: currentItem, revealed: revealed || currentItem.reviewMode == "review") {
                        revealed.toggle()
                    }

                    memoryButtons
                } else {
                    completePanel
                }

                shortcutFooter
            }
            .frame(maxWidth: 900)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 10)
            .padding(.bottom, 22)
        }
        .task {
            await load()
            await completeTaskAndFinishIfReady()
        }
    }

    private var focusProgressHeader: some View {
        VStack(spacing: 10) {
            Text(isExtraPractice ? "加练进度：第 \(min(extraIndex + 1, max(extraQueue.count, 1))) 个 / 共 \(extraQueue.count) 个" : "第 \(currentBatchNumber) 批 / 共 \(totalBatchCount) 批")
                .font(.headline)
                .foregroundStyle(.primary)

            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(.white.opacity(0.42))
                        .overlay(Capsule().stroke(.white.opacity(0.55), lineWidth: 1))
                    Capsule()
                        .fill(ArkTheme.success)
                        .frame(width: max(10, proxy.size.width * progressRatio))
                        .shadow(color: ArkTheme.success.opacity(0.45), radius: 8)
                    if !isExtraPractice {
                        ForEach(0..<totalBatchCount, id: \.self) { index in
                            Circle()
                                .fill(index < currentBatchNumber ? ArkTheme.success : Color.white.opacity(0.9))
                                .overlay(Circle().stroke(.white.opacity(0.8), lineWidth: 1))
                                .frame(width: index == currentBatchNumber - 1 ? 14 : 11, height: index == currentBatchNumber - 1 ? 14 : 11)
                                .position(x: dotX(index: index, width: proxy.size.width), y: 8)
                        }
                    }
                }
            }
            .frame(height: 16)
        }
        .padding(.top, 4)
    }

    private var progressRatio: Double {
        if isExtraPractice {
            guard !extraQueue.isEmpty else { return 0 }
            return min(1, Double(extraIndex) / Double(extraQueue.count))
        }
        guard totalBatchCount > 1 else { return 1 }
        return min(1, (0.1 + (Double(currentBatchNumber - 1) / Double(totalBatchCount - 1)) * 0.8))
    }

    private func dotX(index: Int, width: CGFloat) -> CGFloat {
        guard totalBatchCount > 1 else { return width / 2 }
        return width * CGFloat(0.1 + (Double(index) / Double(totalBatchCount - 1)) * 0.8)
    }

    @ViewBuilder
    private var extraPracticeContent: some View {
        if isLoadingExtra {
            loadingPanel("正在为您加载加练单词...")
        } else if extraQueue.indices.contains(extraIndex) {
            VocabFocusWordCard(item: extraQueue[extraIndex], revealed: revealed) {
                revealed.toggle()
            }
            memoryButtons
        } else {
            VStack(alignment: .leading, spacing: 16) {
                Text("加练已全部完成")
                    .font(.title3.weight(.bold))
                Text("您已完成了本轮加练单词。您可以选择再次加练，或者结束专注。")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                HStack(spacing: 12) {
                    Button {
                        Task { await stopFocusAfterExtraPractice() }
                    } label: {
                        Label("结束本轮专注", systemImage: "stop.circle")
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(isPaused)

                    Button {
                        Task { await loadExtraPractice() }
                    } label: {
                        Label("再来一次", systemImage: "arrow.triangle.2.circlepath")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .disabled(isPaused || isLoadingExtra)
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .stroke(.white.opacity(0.45), lineWidth: 1)
            }
        }
    }

    private var batchReviewPanel: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("上一批已完成 \(completedBatchWordIds.count) 个单词。")
                .font(.headline)
                .foregroundStyle(.secondary)
            HStack {
                Spacer()
                Button {
                    Task { await continueBatchReview() }
                } label: {
                    Text(currentQueueCount > 0 ? "进入下一批" : "今日已完成")
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(isPaused || isSubmitting)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.45), lineWidth: 1)
        }
    }

    private var completePanel: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("今天这本词书的单词已经完成了。")
                .font(.headline)
                .foregroundStyle(.secondary)
            HStack(spacing: 12) {
                Button {
                    Task { await completeTaskAndFinishIfReady(force: true) }
                } label: {
                    Label("完成今日单词", systemImage: "checkmark.circle.fill")
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(isPaused || didCompleteTodayFocus)

                Button {
                    Task { await loadExtraPractice() }
                } label: {
                    Label(isLoadingExtra ? "正在加载..." : "再来一次", systemImage: "arrow.triangle.2.circlepath")
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .disabled(isPaused || isLoadingExtra)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.45), lineWidth: 1)
        }
    }

    private var memoryButtons: some View {
        HStack(spacing: 12) {
            memoryButton(.again)
            memoryButton(.hard)
            memoryButton(.good)
            memoryButton(.easy)
        }
    }

    private func memoryButton(_ result: VocabFocusMemoryResult) -> some View {
        Button {
            Task { await submit(result) }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: result.symbol)
                    .font(.headline)
                    .foregroundStyle(result.tint)
                    .frame(width: 32, height: 32)
                    .background(.white.opacity(0.42), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(result.title)
                            .font(.headline)
                        Text(result.shortcut)
                            .font(.caption2.monospaced().weight(.bold))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(.white.opacity(0.45), in: RoundedRectangle(cornerRadius: 4, style: .continuous))
                    }
                    Text(result.hint)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
        }
        .buttonStyle(.bordered)
        .controlSize(.large)
        .tint(result.tint)
        .disabled(isPaused || isSubmitting)
    }

    private var shortcutFooter: some View {
        HStack(spacing: 8) {
            Text("i")
                .font(.caption2.monospaced().weight(.bold))
                .frame(width: 20, height: 20)
                .background(.white.opacity(0.45), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
            Text("键盘快捷键：[1-4] 选择记忆度并提交，[←/→] 切换单词，[Space/Enter] 显示/隐藏释义")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.top, 4)
    }

    private func loadingPanel(_ message: String) -> some View {
        VStack(spacing: 14) {
            ProgressView()
            Text(message)
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 260)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
    }

    private func messagePanel(title: String, message: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.title3.weight(.bold))
            Text(message)
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
    }

    private func load() async {
        guard let token = session.token else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let loadedDecks: [VocabDeck] = try await session.api.get("/api/vocab/decks", token: token)
            decks = loadedDecks
            let deckId = selectedDeckId ?? loadedDecks.first?.id
            selectedDeckId = deckId
            if let deckId {
                await loadDeckContent(deckId: deckId)
            }
            await completeTaskAndFinishIfReady()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadDeckContent(deckId: String) async {
        guard let token = session.token else { return }
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

            let summary = try await todayResponse
            todaySummary = summary
            initialCompletedCount = summary.completedCount
            completedBatchWordIds = []
            completedSessionWordIds = []
            didCompleteTodayFocus = false
            hasLoadedInitialContent = true
            isBatchReview = false
            learningQueue = (try? await learningResponse) ?? []
            reviewQueue = (try? await reviewResponse) ?? []
            studyQueue = (try? await studyResponse) ?? []
            cardStartedAt = Date()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func submit(_ result: VocabFocusMemoryResult) async {
        if isPaused { return }

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
            let payload = VocabReviewSubmitPayload(
                deckId: deck.id,
                wordId: item.id,
                result: result.rawValue,
                reviewMode: item.reviewMode,
                promptType: item.promptType,
                responseMs: max(0, Int(Date().timeIntervalSince(cardStartedAt) * 1000))
            )
            let response: VocabReviewSubmitResult = try await session.api.post("/api/vocab/reviews", token: token, body: payload)
            lastResult = response
            consume(item, shouldRepeatToday: response.shouldRepeatToday)
            if !response.shouldRepeatToday {
                if !completedSessionWordIds.contains(item.id) {
                    completedSessionWordIds.append(item.id)
                }
                if !completedBatchWordIds.contains(item.id) {
                    completedBatchWordIds.append(item.id)
                }
                if completedBatchWordIds.count >= batchReviewSize {
                    isBatchReview = true
                }
            }
            revealed = false
            cardStartedAt = Date()
            await completeTaskAndFinishIfReady()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func continueBatchReview() async {
        isBatchReview = false
        completedBatchWordIds = []
        lastResult = nil
        await completeTaskAndFinishIfReady()
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

    private func completeTaskAndFinishIfReady(force: Bool = false) async {
        guard force else { return }
        guard !isPaused else { return }
        guard !didCompleteTodayFocus else { return }
        guard hasLoadedInitialContent else { return }
        guard !isExtraPractice else { return }
        guard !isBatchReview else { return }
        guard completedBatchWordIds.isEmpty else { return }
        guard errorMessage == nil else { return }
        guard currentItem == nil else { return }

        didCompleteTodayFocus = true
        let succeeded = await onCompleteTaskAndFinish()
        if !succeeded {
            didCompleteTodayFocus = false
        }
    }

    private func stopFocusAfterExtraPractice() async {
        guard !isPaused else { return }
        await onStopFocus()
    }
}

private struct VocabFocusMetric: View {
    let title: String
    let value: String
    let symbol: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: symbol)
                .font(.headline)
                .foregroundStyle(ArkTheme.accent)
            Text(value)
                .font(.title.weight(.heavy))
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .arkCard()
    }
}

private struct VocabFocusWordCard: View {
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
        VStack(spacing: 18) {
            Text(item.reviewMode.uppercased())
                .font(.caption.weight(.semibold))
                .tracking(3)
                .foregroundStyle(.secondary)

            HStack(spacing: 8) {
                Text(item.word)
                    .font(.system(size: 58, weight: .heavy, design: .rounded))
                    .minimumScaleFactor(0.55)
                    .lineLimit(1)

                ForEach(posTags, id: \.self) { pos in
                    Text(pos)
                        .font(.caption.weight(.bold))
                        .padding(.horizontal, 9)
                        .padding(.vertical, 5)
                        .background(ArkTheme.success.opacity(0.14), in: Capsule())
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

            if revealed {
                VStack(spacing: 12) {
                    Text(translationsText.isEmpty ? "暂无释义" : translationsText)
                        .font(.title3.weight(.semibold))
                        .multilineTextAlignment(.center)

                    if let sentence = item.sentences.first {
                        Text(sentence.sentence)
                            .font(.callout)
                            .multilineTextAlignment(.center)
                        Text(sentence.translation)
                            .font(.caption)
                            .foregroundStyle(.secondary)
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
        .frame(maxWidth: .infinity, minHeight: 340)
        .padding(26)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.45), lineWidth: 1)
        }
    }
}

private enum VocabFocusMemoryResult: String, CaseIterable, Identifiable {
    case again
    case hard
    case good
    case easy

    static let options: [VocabFocusMemoryResult] = [.again, .hard, .good, .easy]

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
        case .hard: "进入较短间隔"
        case .good: "进入正常间隔"
        case .easy: "延后更久再看"
        }
    }

    var shortcut: String {
        switch self {
        case .again: "1"
        case .hard: "2"
        case .good: "3"
        case .easy: "4"
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

private struct FocusWorkOverlayHeader: View {
    let workflow: FocusWorkflow
    let title: String
    let subtitle: String
    let timerText: String
    let isBusy: Bool
    let onPauseResume: () -> Void
    let onAbandon: () -> Void
    let onCompleteRound: () -> Void

    private var statusText: String {
        if workflow.recordFocus == false {
            return "本次工作将不记录在专注时间中"
        }
        if workflow.isPaused == true {
            return "已暂停"
        }
        return "正在记录专注"
    }

    private var statusTint: Color {
        if workflow.recordFocus == false {
            return ArkTheme.warning
        }
        if workflow.isPaused == true {
            return ArkTheme.accent
        }
        return ArkTheme.success
    }

    var body: some View {
        HStack(spacing: 18) {
            VStack(alignment: .leading, spacing: 5) {
                Text("FOCUS WORK")
                    .font(.caption.weight(.semibold))
                    .tracking(3)
                    .foregroundStyle(.secondary)
                Text(title)
                    .font(.largeTitle.weight(.heavy))
                Text(subtitle)
                    .font(.headline)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 5) {
                Text(timerText)
                    .font(.system(size: 54, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                Text(workflow.workflowName ?? "当前工作流")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            Text(statusText)
                .font(.caption.weight(.semibold))
                .foregroundStyle(statusTint)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(statusTint.opacity(0.14), in: Capsule())
                .overlay {
                    Capsule()
                        .stroke(statusTint.opacity(0.35), lineWidth: 1)
                }

            Button {
                onPauseResume()
            } label: {
                Label(workflow.isPaused == true ? "继续专注" : "暂停专注", systemImage: workflow.isPaused == true ? "play.fill" : "pause.fill")
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .disabled(isBusy || workflow.pendingConfirmation == true)

            Button(role: .destructive) {
                onAbandon()
            } label: {
                Label("放弃本阶段", systemImage: "xmark.circle")
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .disabled(isBusy)

            Button {
                onCompleteRound()
            } label: {
                Label("结束本轮专注", systemImage: "checkmark.circle.fill")
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(isBusy)
        }
        .padding(22)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.55), lineWidth: 1)
        }
    }
}

private struct PauseOverlayCard: View {
    var body: some View {
        ZStack {
            Rectangle()
                .fill(.ultraThinMaterial)
                .ignoresSafeArea()

            VStack(spacing: 14) {
                Text("PAUSED")
                    .font(.caption.weight(.semibold))
                    .tracking(3)
                    .foregroundStyle(.secondary)
                Text("专注已暂停")
                    .font(.system(size: 38, weight: .heavy, design: .rounded))
                Text("继续后会从当前阶段接着计时，暂停期间不会提交业务动作。")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(34)
            .frame(width: 460)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 30, style: .continuous)
                    .stroke(.white.opacity(0.55), lineWidth: 1)
            }
            .shadow(color: .black.opacity(0.15), radius: 28, x: 0, y: 14)
        }
    }
}
