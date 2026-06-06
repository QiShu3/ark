import SwiftUI

struct FocusScreen: View {
    @EnvironmentObject private var session: AppSession
    @State private var workflow: FocusWorkflow?
    @State private var tasks: [ArkTask] = []
    @State private var todayFocusMinutes = 0
    @State private var presets: [WorkflowPreset] = []
    @State private var isLoading = false
    @State private var isActing = false
    @State private var isTaskPickerPresented = false
    @State private var isWorkflowStartPresented = false
    @State private var selectedWorkflowStartId: String?
    @State private var errorMessage: String?
    @State private var timerNow = Date()

    private let liveTimer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private var isActive: Bool {
        guard let state = workflow?.state else { return false }
        return state != "normal"
    }

    private var timerText: String {
        formatFocusTimer(workflow?.liveTimerSeconds(now: timerNow) ?? 0)
    }

    private var primaryActionTitle: String {
        if workflow?.pendingTaskSelection == true { return "选择任务" }
        if workflow?.state == "break" { return "结束休息" }
        if workflow?.pendingConfirmation == true { return "确认流转" }
        if workflow?.state == "focus" { return "结束阶段" }
        return "开始学习"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("专注")
                        .font(.largeTitle.weight(.heavy))
                    Text("和 Web 端工作流接口保持一致。")
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

            HStack(alignment: .top, spacing: 20) {
                VStack(alignment: .leading, spacing: 22) {
                    HStack(spacing: 10) {
                        Circle()
                            .fill(isActive ? ArkTheme.success : ArkTheme.accent)
                            .frame(width: 10, height: 10)
                        Text(workflow?.stateDisplay ?? "待开始")
                            .font(.headline.weight(.bold))
                            .foregroundStyle(.secondary)
                    }

                    Text(timerText)
                        .font(.system(size: 84, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                        .minimumScaleFactor(0.6)

                    VStack(alignment: .leading, spacing: 8) {
                        Text(workflow?.workflowName ?? presets.first(where: { $0.isDefault == true })?.name ?? "默认工作流")
                            .font(.title2.weight(.bold))
                        Text(workflow?.summary ?? "还没有运行中的工作流。")
                            .font(.title3)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }

                    Spacer()

                    HStack(spacing: 14) {
                        Button {
                            Task { await runPrimaryAction() }
                        } label: {
                            if isActing {
                                ProgressView()
                            } else {
                                Label(primaryActionTitle, systemImage: isActive ? "forward.end.fill" : "play.fill")
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .disabled(isActing || isLoading)

                        Button {
                            Task { await togglePause() }
                        } label: {
                            Label(workflow?.isPaused == true ? "恢复" : "暂停", systemImage: workflow?.isPaused == true ? "play" : "pause")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                        .disabled(!isActive || workflow?.state != "focus" || workflow?.pendingConfirmation == true || isActing)

                        Button(role: .destructive) {
                            Task { await stopFocus() }
                        } label: {
                            Label("停止", systemImage: "stop.fill")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                        .disabled(!isActive || isActing)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 500, alignment: .leading)
                .arkCard()

                VStack(alignment: .leading, spacing: 16) {
                    FocusDetailTile(title: "当前阶段", value: workflow?.phaseName ?? "暂无阶段", symbol: "list.bullet.rectangle")
                    FocusDetailTile(title: "任务", value: workflow?.taskTitle ?? "未绑定任务", symbol: "checklist")
                    FocusDetailTile(title: "今日专注", value: "\(todayFocusMinutes) 分钟", symbol: "chart.bar")

                    VStack(alignment: .leading, spacing: 10) {
                        Label("可用工作流", systemImage: "square.stack.3d.up")
                            .font(.headline)
                        if presets.isEmpty {
                            Text("暂无工作流预设")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(presets.prefix(4)) { preset in
                                HStack {
                                    Text(preset.name)
                                        .font(.callout.weight(.semibold))
                                        .lineLimit(1)
                                    Spacer()
                                    if preset.isDefault == true {
                                        Text("默认")
                                            .font(.caption.weight(.bold))
                                            .foregroundStyle(ArkTheme.accent)
                                    }
                                }
                                .padding(10)
                                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            }
                        }
                    }
                    .arkCard()

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.callout)
                            .foregroundStyle(.red)
                            .arkCard()
                    }
                }
                .frame(width: 360, alignment: .topLeading)
            }
        }
        .padding(28)
        .navigationTitle("专注")
        .overlay {
            if isLoading {
                ProgressView()
                    .padding(28)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
        }
        .arkScreenBackground()
        .sheet(isPresented: $isTaskPickerPresented) {
            FocusTaskPickerSheet(
                tasks: tasks.filter { !$0.isDone },
                isSelecting: isActing,
                onCancel: { isTaskPickerPresented = false },
                onSelect: { task in Task { await selectTask(task) } }
            )
        }
        .sheet(isPresented: $isWorkflowStartPresented) {
            WorkflowStartSheet(
                presets: presets,
                selectedPresetId: $selectedWorkflowStartId,
                tasks: tasks,
                isSubmitting: isActing,
                onCancel: { isWorkflowStartPresented = false },
                onStart: { preset in Task { await startWorkflow(preset) } },
                onSetDefault: { preset in Task { await setDefaultWorkflow(preset) } }
            )
        }
        .task {
            await load()
        }
        .onReceive(NotificationCenter.default.publisher(for: .arkFocusWorkflowDidChange)) { _ in
            Task { await load() }
        }
        .onReceive(liveTimer) { value in
            timerNow = value
        }
    }

    private func load() async {
        guard let token = session.token else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            async let workflowResponse: FocusWorkflow = session.api.get("/todo/focus/workflow/current", token: token)
            async let tasksResponse: [ArkTask] = session.api.get("/todo/tasks?limit=100", token: token)
            async let todayResponse: TodayFocusSummary = session.api.get("/todo/focus/today", token: token)
            async let presetsResponse: [WorkflowPreset] = session.api.get("/todo/focus/workflows", token: token)

            workflow = try? await workflowResponse
            tasks = (try? await tasksResponse) ?? []
            todayFocusMinutes = (try? await todayResponse)?.minutes ?? 0
            presets = (try? await presetsResponse) ?? []
        }
    }

    private func runPrimaryAction() async {
        guard let token = session.token else { return }
        isActing = true
        errorMessage = nil
        defer { isActing = false }

        do {
            let currentWorkflow: FocusWorkflow = try await session.api.get("/todo/focus/workflow/current", token: token)
            workflow = currentWorkflow

            if currentWorkflow.pendingTaskSelection == true {
                isTaskPickerPresented = true
                return
            }

            if currentWorkflow.state == "break", currentWorkflow.pendingConfirmation == true {
                applyWorkflowTransition(try await session.api.post("/todo/focus/workflow/confirm", token: token))
            } else if currentWorkflow.state == "break" {
                applyWorkflowTransition(try await session.api.post("/todo/focus/workflow/skip_phase", token: token))
            } else if currentWorkflow.pendingConfirmation == true {
                applyWorkflowTransition(try await session.api.post("/todo/focus/workflow/confirm", token: token))
            } else if currentWorkflow.state == "focus" {
                applyWorkflowTransition(try await session.api.post("/todo/focus/workflow/confirm", token: token))
            } else {
                let availablePresets: [WorkflowPreset]
                if presets.isEmpty {
                    availablePresets = try await session.api.get("/todo/focus/workflows", token: token)
                } else {
                    availablePresets = presets
                }
                guard let preset = availablePresets.first(where: { $0.isDefault == true }) ?? availablePresets.first else {
                    errorMessage = "还没有可启动的工作流"
                    return
                }
                presets = availablePresets
                selectedWorkflowStartId = preset.id
                isWorkflowStartPresented = true
            }

            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func startWorkflow(_ preset: WorkflowPreset) async {
        guard let token = session.token else { return }
        isActing = true
        errorMessage = nil
        defer { isActing = false }

        do {
            workflow = try await session.api.post("/todo/focus/workflows/\(preset.id)/start", token: token)
            isWorkflowStartPresented = false
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func applyWorkflowTransition(_ snapshot: FocusWorkflow) {
        workflow = snapshot
        snapshot.notifyCompletionIfNeeded()
    }

    private func setDefaultWorkflow(_ preset: WorkflowPreset) async {
        guard let token = session.token else { return }
        isActing = true
        errorMessage = nil
        defer { isActing = false }

        do {
            let _: WorkflowPreset = try await session.api.post("/todo/focus/workflows/\(preset.id)/default", token: token)
            presets = try await session.api.get("/todo/focus/workflows", token: token)
            selectedWorkflowStartId = preset.id
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func togglePause() async {
        guard let token = session.token else { return }
        isActing = true
        errorMessage = nil
        defer { isActing = false }

        do {
            let path = workflow?.isPaused == true ? "/todo/focus/workflow/resume" : "/todo/focus/workflow/pause"
            workflow = try await session.api.post(path, token: token)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func stopFocus() async {
        guard let token = session.token else { return }
        isActing = true
        errorMessage = nil
        defer { isActing = false }

        do {
            let _: EmptyResponse = try await session.api.post("/todo/focus/stop", token: token)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func selectTask(_ task: ArkTask) async {
        guard let token = session.token else { return }
        isActing = true
        errorMessage = nil
        defer { isActing = false }

        do {
            let payload = FocusWorkflowSelectTaskPayload(taskId: task.id)
            workflow = try await session.api.post("/todo/focus/workflow/select-task", token: token, body: payload)
            isTaskPickerPresented = false
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct FocusTaskPickerSheet: View {
    let tasks: [ArkTask]
    let isSelecting: Bool
    let onCancel: () -> Void
    let onSelect: (ArkTask) -> Void

    var body: some View {
        NavigationStack {
            List {
                if tasks.isEmpty {
                    ContentUnavailableView("没有可选择的任务", systemImage: "checklist", description: Text("请先在今日安排里创建或恢复一个未完成任务。"))
                } else {
                    Section("待选任务") {
                        ForEach(tasks) { task in
                            Button {
                                onSelect(task)
                            } label: {
                                HStack(spacing: 14) {
                                    Image(systemName: task.appId == nil ? "circle" : "app.badge")
                                        .foregroundStyle(ArkTheme.accent)
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(task.title)
                                            .font(.headline)
                                        Text(task.appId?.uppercased() ?? "自定义任务")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if isSelecting {
                                        ProgressView()
                                    } else {
                                        Image(systemName: "chevron.right")
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                            .disabled(isSelecting)
                            .accessibilityLabel("选择任务 \(task.title)")
                        }
                    }
                }
            }
            .navigationTitle("选择当前阶段任务")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消", action: onCancel)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

private struct FocusDetailTile: View {
    let title: String
    let value: String
    let symbol: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: symbol)
                .font(.title2)
                .foregroundStyle(ArkTheme.accent)
            Text(value)
                .font(.headline.weight(.bold))
                .lineLimit(2)
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .arkCard()
    }
}

private func formatFocusTimer(_ seconds: Int) -> String {
    let safeSeconds = max(0, seconds)
    let minutes = safeSeconds / 60
    let restSeconds = safeSeconds % 60
    return String(format: "%02d:%02d", minutes, restSeconds)
}
