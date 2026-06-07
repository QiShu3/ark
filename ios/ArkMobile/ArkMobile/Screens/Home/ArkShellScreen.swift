import SwiftUI
import UIKit

struct ArkShellScreen: View {
    @Binding var selection: AppSection?
    @EnvironmentObject private var session: AppSession
    @State private var completedWorkflowName: String?
    @State private var primaryEvent: ArkEvent?
    @State private var navNow = Date()
    @State private var isEventOverviewPresented = false

    private let navTimer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private var isCompletionAlertPresented: Binding<Bool> {
        Binding(
            get: { completedWorkflowName != nil },
            set: { isPresented in
                if !isPresented {
                    completedWorkflowName = nil
                }
            }
        )
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                ArkTheme.shellBackground
                    .ignoresSafeArea()

                VStack(spacing: 10) {
                    ArkTopNavigation(
                        selection: $selection,
                        username: session.user?.username ?? "qishuadmin",
                        primaryEvent: primaryEvent,
                        now: navNow,
                        onPrimaryEventTap: {
                            isEventOverviewPresented = true
                        }
                    )

                    if selection == .home || selection == nil {
                        WebInspiredHomeScreen { section in
                            selection = section
                        }
                    } else {
                        NavigationStack {
                            AppDetailView(selection: selection ?? .home) { section in
                                selection = section
                            }
                                .toolbar(.hidden, for: .navigationBar)
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 28, style: .continuous)
                                .stroke(.white.opacity(0.35), lineWidth: 1)
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.top, max(10, proxy.safeAreaInsets.top + 6))
                .padding(.bottom, max(10, proxy.safeAreaInsets.bottom + 6))

                FocusWorkOverlay()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .zIndex(100)
            }
        }
        .tint(ArkHomeStyle.accent)
        .task(id: session.token) {
            await loadPrimaryEvent()
        }
        .onReceive(navTimer) { value in
            navNow = value
        }
        .onReceive(NotificationCenter.default.publisher(for: .arkFocusWorkflowDidComplete)) { notification in
            completedWorkflowName = notification.object as? String
        }
        .fullScreenCover(isPresented: $isEventOverviewPresented) {
            EventOverviewSheet {
                await loadPrimaryEvent()
                NotificationCenter.default.post(name: .arkScheduleDidChange, object: nil)
            }
            .environmentObject(session)
        }
        .alert("恭喜完成\(completedWorkflowName ?? "")工作流", isPresented: isCompletionAlertPresented) {
            Button("好的", role: .cancel) {
                completedWorkflowName = nil
            }
        }
    }

    private func loadPrimaryEvent() async {
        guard let token = session.token else {
            primaryEvent = nil
            return
        }

        do {
            primaryEvent = try await session.api.get("/todo/events/primary", token: token)
        } catch {
            primaryEvent = nil
        }
    }
}

private enum ArkHomeStyle {
    static let accent = Color(red: 0.22, green: 0.45, blue: 0.92)
    static let text = Color(red: 0.07, green: 0.12, blue: 0.22)
    static let muted = Color(red: 0.42, green: 0.49, blue: 0.60)
    static let faint = Color(red: 0.58, green: 0.64, blue: 0.72)
    static let border = Color.white.opacity(0.56)

    static func glass(cornerRadius: CGFloat = 24) -> some ShapeStyle {
        .regularMaterial
    }
}

private struct ArkTopNavigation: View {
    @Binding var selection: AppSection?
    let username: String
    let primaryEvent: ArkEvent?
    let now: Date
    let onPrimaryEventTap: () -> Void

    private var eventName: String {
        primaryEvent?.name ?? "未设置主事件"
    }

    private var countdownText: String {
        guard let dueAt = primaryEvent?.dueAt else { return "未设置" }
        return eventCountdownDisplay(dueAt: dueAt, now: now)
    }

    var body: some View {
        HStack(spacing: 16) {
            Button {
                selection = .home
            } label: {
                BundledRasterImage(name: "favicon", extensionName: "png")
                    .scaledToFit()
                    .clipShape(Circle())
                    .overlay {
                        Circle()
                            .stroke(.white.opacity(0.8), lineWidth: 1)
                    }
                .frame(width: 54, height: 54)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("返回首页")

            Button(action: onPrimaryEventTap) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(eventName)
                        .font(.headline.weight(.heavy))
                        .foregroundStyle(ArkHomeStyle.text)
                        .lineLimit(1)
                    Text(countdownText)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(ArkHomeStyle.muted)
                }
            }
            .buttonStyle(.plain)
            .frame(width: 210, alignment: .leading)
            .accessibilityLabel("打开主事件：\(eventName)，倒计时 \(countdownText)")

            Spacer()

            HStack(spacing: 12) {
                ToolbarCircle(symbol: "book", label: "重新进入首次体验引导") { selection = .home }
                ToolbarCircle(symbol: "calendar", label: "打开导航栏日历") { selection = .tasks }
                ToolbarCircle(symbol: "sun.max", label: "切换外观模式") { selection = .settings }
                ToolbarCircle(symbol: "bell", label: "通知中心") { selection = .home }
                ToolbarCircle(symbol: "gearshape", label: "打开界面设置") { selection = .settings }

                Button {
                    selection = .settings
                } label: {
                    ZStack(alignment: .bottomTrailing) {
                        BundledRasterImage(name: "chara", extensionName: "png")
                            .scaledToFill()
                            .frame(width: 52, height: 52)
                            .clipShape(Circle())
                            .allowsHitTesting(false)
                            .accessibilityHidden(true)
                        Circle()
                            .fill(Color.green)
                            .frame(width: 11, height: 11)
                            .overlay { Circle().stroke(.white, lineWidth: 2) }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("打开用户菜单：\(username)")
            }
        }
        .padding(.horizontal, 24)
        .frame(height: 96)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 48, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 48, style: .continuous)
                .stroke(.white.opacity(0.58), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.06), radius: 24, x: 0, y: 10)
    }
}

private struct ToolbarCircle: View {
    let symbol: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.title3.weight(.semibold))
                .frame(width: 60, height: 60)
        }
        .buttonStyle(.plain)
        .foregroundStyle(ArkHomeStyle.text)
        .background(.ultraThinMaterial, in: Circle())
        .overlay { Circle().stroke(.white.opacity(0.58), lineWidth: 1) }
        .accessibilityLabel(label)
    }
}

private struct EventOverviewSheet: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var events: [ArkEvent] = []
    @State private var selectedEvent: ArkEvent?
    @State private var isCreatePresented = false
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var now = Date()

    private let onChanged: () async -> Void
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    init(onChanged: @escaping () async -> Void) {
        self.onChanged = onChanged
    }

    private var sortedEvents: [ArkEvent] {
        events.sorted { lhs, rhs in
            if lhs.isPrimary != rhs.isPrimary {
                return lhs.isPrimary && !rhs.isPrimary
            }
            return lhs.dueAt < rhs.dueAt
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 14) {
                    if isLoading {
                        ProgressView("加载事件中...")
                            .frame(maxWidth: .infinity, minHeight: 180)
                    } else if let errorMessage {
                        ContentUnavailableView("事件加载失败", systemImage: "exclamationmark.triangle", description: Text(errorMessage))
                    } else if sortedEvents.isEmpty {
                        ContentUnavailableView("暂无事件", systemImage: "calendar.badge.plus", description: Text("可以先创建一个主事件。"))
                    } else {
                        ForEach(sortedEvents) { event in
                            EventOverviewCard(event: event, now: now) {
                                selectedEvent = event
                            }
                        }
                    }

                    Button {
                        isCreatePresented = true
                    } label: {
                        Label("添加事件", systemImage: "plus")
                            .font(.headline)
                            .frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 18)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(.separator.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [6, 5]))
                    }
                }
                .padding(24)
                .frame(maxWidth: 760)
                .frame(maxWidth: .infinity)
            }
            .background(ArkTheme.shellBackground.ignoresSafeArea())
            .navigationTitle("事件总览")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("关闭") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await load() }
                    } label: {
                        Label("刷新", systemImage: "arrow.clockwise")
                    }
                }
            }
            .task {
                await load()
            }
            .onReceive(timer) { value in
                now = value
            }
            .fullScreenCover(item: $selectedEvent) { event in
                EventWorkbenchSheet(event: event) {
                    await load()
                    await onChanged()
                }
                .environmentObject(session)
            }
            .sheet(isPresented: $isCreatePresented) {
                EventCreateSheet {
                    await load()
                    await onChanged()
                }
                .environmentObject(session)
            }
        }
    }

    private func load() async {
        guard let token = session.token else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            events = try await session.api.get("/todo/events", token: token)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct EventOverviewCard: View {
    let event: ArkEvent
    let now: Date
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 9) {
                    HStack(spacing: 8) {
                        Text(event.name)
                            .font(.title3.weight(.heavy))
                            .lineLimit(1)

                        if event.isPrimary {
                            Text("主事件")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(ArkTheme.accent)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(ArkTheme.accent.opacity(0.12), in: Capsule())
                        }
                    }

                    Text("创建于 \(formatEventDateTime(event.createdAt))")
                    Text("开始于 \(event.startDate)")
                    Text("到期于 \(formatEventDateTime(event.dueAt))")
                }
                .font(.callout)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)

                Text(eventCountdownDisplay(dueAt: event.dueAt, now: now))
                    .font(.system(size: 30, weight: .heavy, design: .rounded))
                    .foregroundStyle(eventCountdownColor(dueAt: event.dueAt, now: now))
                    .monospacedDigit()
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(.separator.opacity(0.35), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(event.name) \(event.isPrimary ? "主事件" : "") \(eventCountdownDisplay(dueAt: event.dueAt, now: now))")
    }
}

private struct EventCreateSheet: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var startDate = Date()
    @State private var dueAt = Calendar.current.date(byAdding: .month, value: 6, to: Date()) ?? Date()
    @State private var isPrimary = false
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    let onCreated: () async -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if let errorMessage {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .arkCard()
                    }

                    VStack(alignment: .leading, spacing: 16) {
                        Text("基本信息")
                            .font(.title3.weight(.heavy))

                        TextField("事件名称", text: $name)
                            .textFieldStyle(.roundedBorder)

                        DatePicker("开始日期", selection: $startDate, displayedComponents: .date)
                            .datePickerStyle(.compact)

                        DatePicker("截止时间", selection: $dueAt, displayedComponents: [.date, .hourAndMinute])
                            .datePickerStyle(.compact)

                        Toggle("设为主事件", isOn: $isPrimary)
                    }
                    .arkCard()
                }
                .padding(24)
            }
            .navigationTitle("添加事件")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await createEvent() }
                    } label: {
                        if isSubmitting {
                            ProgressView()
                        } else {
                            Text("创建事件")
                        }
                    }
                    .disabled(isSubmitting)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func createEvent() async {
        guard let token = session.token else { return }
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            errorMessage = "请输入事件名称"
            return
        }

        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            let payload = EventMutationPayload(
                name: trimmedName,
                startDate: formatEventStartDate(startDate),
                dueAt: dueAt,
                isPrimary: isPrimary
            )
            let _: ArkEvent = try await session.api.post("/todo/events", token: token, body: payload)
            await onCreated()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct EventWorkbenchSheet: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss

    let event: ArkEvent
    let onChanged: () async -> Void

    @State private var workbench: EventWorkbench?
    @State private var workflows: [WorkflowPreset] = []
    @State private var achievementSummary: AchievementSummary?
    @State private var eventName: String
    @State private var startDate: Date
    @State private var dueAt: Date
    @State private var isLoading = false
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var deletionRequest: EventDeletionRequest?
    @State private var isAppConfigPresented = false
    @State private var taskEditorContext: EventTaskEditorContext?
    @State private var appointmentEditorContext: EventAppointmentEditorContext?
    @State private var workflowEditorContext: EventWorkflowEditorContext?
    @State private var workflowToDelete: WorkflowPreset?
    @State private var noticeMessage: String?

    init(event: ArkEvent, onChanged: @escaping () async -> Void) {
        self.event = event
        self.onChanged = onChanged
        _eventName = State(initialValue: event.name)
        _startDate = State(initialValue: parseEventStartDate(event.startDate) ?? Date())
        _dueAt = State(initialValue: event.dueAt)
    }

    private var currentEvent: ArkEvent {
        workbench?.event ?? event
    }

    private var tasks: [ArkTask] {
        workbench?.createdTasks ?? []
    }

    private var appointments: [ArkAppointment] {
        workbench?.createdAppointments ?? []
    }

    private var appTasks: [ArkTask] {
        tasks.filter { $0.appTaskType != nil }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let errorMessage {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .arkCard()
                    }

                    if isLoading {
                        ProgressView("安排加载中...")
                            .frame(maxWidth: .infinity, minHeight: 140)
                            .arkCard()
                    }

                    basicInfoSection
                    arrangementSection
                    achievementSection
                }
                .padding(24)
                .frame(maxWidth: 1120)
                .frame(maxWidth: .infinity, alignment: .top)
            }
            .background(ArkTheme.shellBackground.ignoresSafeArea())
            .navigationTitle("安排")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        dismiss()
                    } label: {
                        Label("关闭", systemImage: "xmark")
                    }
                }
            }
            .task(id: event.id) {
                await load()
            }
            .sheet(isPresented: $isAppConfigPresented) {
                EventAppConfigSheet(
                    tasks: appTasks,
                    event: currentEvent,
                    onChanged: {
                        await load()
                        await onChanged()
                    }
                )
                .environmentObject(session)
            }
            .sheet(item: $taskEditorContext) { context in
                EventTaskEditorSheet(
                    event: currentEvent,
                    context: context,
                    onChanged: {
                        await load()
                        await onChanged()
                    }
                )
                .environmentObject(session)
            }
            .sheet(item: $appointmentEditorContext) { context in
                EventAppointmentEditorSheet(
                    event: currentEvent,
                    context: context,
                    onChanged: {
                        await load()
                        await onChanged()
                    }
                )
                .environmentObject(session)
            }
            .sheet(item: $workflowEditorContext) { context in
                EventWorkflowEditorSheet(
                    event: currentEvent,
                    tasks: tasks,
                    context: context,
                    onChanged: {
                        await load()
                        await onChanged()
                        NotificationCenter.default.post(name: .arkFocusWorkflowDidChange, object: nil)
                    }
                )
                .environmentObject(session)
            }
            .alert(item: $deletionRequest) { request in
                Alert(
                    title: Text("确定删除“\(currentEvent.name)”吗？"),
                    message: Text(request.message),
                    primaryButton: .destructive(Text("删除")) {
                        Task { await confirmDeleteEvent() }
                    },
                    secondaryButton: .cancel()
                )
            }
            .alert("提示", isPresented: Binding(get: { noticeMessage != nil }, set: { value in
                if !value { noticeMessage = nil }
            })) {
                Button("好的", role: .cancel) { noticeMessage = nil }
            } message: {
                Text(noticeMessage ?? "")
            }
            .confirmationDialog(
                "确认删除该工作流吗？",
                isPresented: Binding(
                    get: { workflowToDelete != nil },
                    set: { value in
                        if !value { workflowToDelete = nil }
                    }
                ),
                titleVisibility: .visible
            ) {
                Button("删除", role: .destructive) {
                    if let workflow = workflowToDelete {
                        Task { await deleteWorkflow(workflow) }
                    }
                }
                Button("取消", role: .cancel) {
                    workflowToDelete = nil
                }
            } message: {
                Text("删除后会从当前事件安排中移除。")
            }
        }
    }

    private var basicInfoSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("基本信息")
                        .font(.title3.weight(.heavy))
                    Text(currentEvent.isPrimary ? "状态：主事件" : "状态：非主事件")
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(currentEvent.isPrimary ? ArkTheme.success : .secondary)
                }

                Spacer()

                HStack(spacing: 10) {
                    Button {
                        Task { await saveEventDetails() }
                    } label: {
                        if isSubmitting {
                            ProgressView()
                        } else {
                            Text("保存事件")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isSubmitting)

                    Button(role: .destructive) {
                        Task { await prepareDeleteEvent() }
                    } label: {
                        Text("删除事件")
                    }
                    .buttonStyle(.bordered)
                    .disabled(isSubmitting)
                }
            }

            Grid(horizontalSpacing: 16, verticalSpacing: 14) {
                GridRow {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("事件名称")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        TextField("事件名称", text: $eventName)
                            .textFieldStyle(.roundedBorder)
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("事件开始日期")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        DatePicker("事件开始日期", selection: $startDate, displayedComponents: .date)
                            .labelsHidden()
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("事件截止时间")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        DatePicker("事件截止时间", selection: $dueAt, displayedComponents: [.date, .hourAndMinute])
                            .labelsHidden()
                    }
                }
            }

            Text("创建于：\(formatEventDateTime(currentEvent.createdAt))")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .arkCard()
    }

    private var arrangementSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("安排内容")
                        .font(.title3.weight(.heavy))
                    Text("直接管理当前事件下的任务、日程和工作流")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Button {
                    isAppConfigPresented = true
                } label: {
                    Label("应用配置", systemImage: "slider.horizontal.3")
                }
                .buttonStyle(.bordered)
            }

            HStack(alignment: .top, spacing: 14) {
                EventTaskColumn(
                    tasks: tasks,
                    onAdd: { taskEditorContext = .new },
                    onEdit: { task in taskEditorContext = .edit(task) }
                )
                EventAppointmentColumn(
                    appointments: appointments,
                    onAdd: { appointmentEditorContext = .new },
                    onEdit: { appointment in appointmentEditorContext = .edit(appointment) }
                )
            }

            EventWorkflowColumn(
                workflows: workflows,
                tasks: tasks,
                onNew: { workflowEditorContext = .new },
                onEdit: { workflow in workflowEditorContext = .edit(workflow) },
                onCopy: { workflow in workflowEditorContext = .copy(workflow) },
                onDelete: { workflow in workflowToDelete = workflow }
            )
        }
        .arkCard()
    }

    private var achievementSection: some View {
        let section = achievementSummary?.eventAchievements
        return VStack(alignment: .leading, spacing: 12) {
            Text("成就摘要")
                .font(.title3.weight(.heavy))

            if let section {
                VStack(alignment: .leading, spacing: 10) {
                    Text(section.summaryText ?? "\(currentEvent.name) 的当前进展")
                        .font(.headline)
                    Text("已解锁 \(section.stats.unlockedCount) 个 · 进行中 \(section.stats.inProgressCount) 个")
                        .font(.callout)
                        .foregroundStyle(.secondary)

                    if let latest = section.latestUnlocked.first {
                        Label("最近解锁：\(latest.title)", systemImage: "checkmark.seal.fill")
                            .font(.callout.weight(.semibold))
                            .foregroundStyle(ArkTheme.success)
                    }

                    if let upcoming = section.upcoming.first {
                        Label("下一步：\(upcoming.title)\(upcoming.progressText.map { " · \($0)" } ?? "")", systemImage: "arrow.right.circle.fill")
                            .font(.callout.weight(.semibold))
                            .foregroundStyle(ArkTheme.accent)
                    }
                }
            } else {
                Text("暂无事件成就进度，完成相关任务或专注后会自动更新。")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .arkCard()
    }

    private func load() async {
        guard let token = session.token else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            async let workbenchResponse: EventWorkbench = session.api.get("/todo/events/\(event.id)/workbench", token: token)
            async let workflowsResponse: [WorkflowPreset] = session.api.get("/todo/events/\(event.id)/workflows", token: token)
            let loadedWorkbench = try await workbenchResponse
            workbench = loadedWorkbench
            workflows = (try? await workflowsResponse) ?? []
            applyEventToForm(loadedWorkbench.event)
            achievementSummary = try? await session.api.get("/todo/achievements/summary?event_id=\(event.id)", token: token)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func saveEventDetails() async {
        guard let token = session.token else { return }
        let trimmedName = eventName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            errorMessage = "请输入事件名称"
            return
        }

        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            let payload = EventMutationPayload(
                name: trimmedName,
                startDate: formatEventStartDate(startDate),
                dueAt: dueAt,
                isPrimary: nil
            )
            let updated: ArkEvent = try await session.api.patch("/todo/events/\(currentEvent.id)", token: token, body: payload)
            updateWorkbenchEvent(updated)
            applyEventToForm(updated)
            await onChanged()
            NotificationCenter.default.post(name: .arkFocusWorkflowDidChange, object: nil)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func prepareDeleteEvent() async {
        guard let token = session.token else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            let preview: EventDeletePreview = try await session.api.get("/todo/events/\(currentEvent.id)/delete-preview", token: token)
            deletionRequest = EventDeletionRequest(preview: preview)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func confirmDeleteEvent() async {
        guard let token = session.token else { return }
        isSubmitting = true
        errorMessage = nil
        defer {
            isSubmitting = false
            deletionRequest = nil
        }

        do {
            let _: EmptyResponse = try await session.api.delete("/todo/events/\(currentEvent.id)", token: token)
            await onChanged()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteWorkflow(_ workflow: WorkflowPreset) async {
        guard let token = session.token else { return }
        isSubmitting = true
        errorMessage = nil
        defer {
            isSubmitting = false
            workflowToDelete = nil
        }

        do {
            let _: EmptyResponse = try await session.api.delete(
                "/todo/events/\(currentEvent.id)/workflows/\(workflow.id)",
                token: token
            )
            await load()
            await onChanged()
            NotificationCenter.default.post(name: .arkFocusWorkflowDidChange, object: nil)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func updateWorkbenchEvent(_ updated: ArkEvent) {
        if let workbench {
            self.workbench = EventWorkbench(
                event: updated,
                createdTasks: workbench.createdTasks,
                createdAppointments: workbench.createdAppointments
            )
        }
    }

    private func applyEventToForm(_ event: ArkEvent) {
        eventName = event.name
        startDate = parseEventStartDate(event.startDate) ?? startDate
        dueAt = event.dueAt
    }
}

private struct EventDeletionRequest: Identifiable {
    let id = UUID()
    let preview: EventDeletePreview

    var message: String {
        "删除后将同时清理该事件下的 \(preview.tasksCount) 个任务、\(preview.appointmentsCount) 个日程、\(preview.workflowsCount) 个工作流、\(preview.appConfigsCount) 个应用配置。此操作不可恢复。"
    }
}

private struct EventTaskEditorContext: Identifiable {
    let id = UUID()
    let task: ArkTask?

    static var new: EventTaskEditorContext {
        EventTaskEditorContext(task: nil)
    }

    static func edit(_ task: ArkTask) -> EventTaskEditorContext {
        EventTaskEditorContext(task: task)
    }
}

private struct EventAppointmentEditorContext: Identifiable {
    let id = UUID()
    let appointment: ArkAppointment?

    static var new: EventAppointmentEditorContext {
        EventAppointmentEditorContext(appointment: nil)
    }

    static func edit(_ appointment: ArkAppointment) -> EventAppointmentEditorContext {
        EventAppointmentEditorContext(appointment: appointment)
    }
}

private struct EventWorkflowEditorContext: Identifiable {
    let id = UUID()
    let workflow: WorkflowPreset?
    let isCopy: Bool

    static var new: EventWorkflowEditorContext {
        EventWorkflowEditorContext(workflow: nil, isCopy: false)
    }

    static func edit(_ workflow: WorkflowPreset) -> EventWorkflowEditorContext {
        EventWorkflowEditorContext(workflow: workflow, isCopy: false)
    }

    static func copy(_ workflow: WorkflowPreset) -> EventWorkflowEditorContext {
        EventWorkflowEditorContext(workflow: workflow, isCopy: true)
    }
}

private struct EventTaskEditorSheet: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss

    let event: ArkEvent
    let context: EventTaskEditorContext
    let onChanged: () async -> Void

    @State private var title: String
    @State private var content: String
    @State private var taskType: String
    @State private var hasStartDate: Bool
    @State private var startDate: Date
    @State private var hasDueDate: Bool
    @State private var dueDate: Date
    @State private var periodType: String
    @State private var customPeriodDays: Int
    @State private var maxCompletionsPerPeriod: Int
    @State private var weekdayOnly: Bool
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var isDeleteConfirmationPresented = false

    init(event: ArkEvent, context: EventTaskEditorContext, onChanged: @escaping () async -> Void) {
        self.event = event
        self.context = context
        self.onChanged = onChanged

        let task = context.task
        _title = State(initialValue: task?.title ?? "")
        _content = State(initialValue: task?.content ?? "")
        _taskType = State(initialValue: task?.taskType ?? "focus")
        _hasStartDate = State(initialValue: task?.startDate != nil)
        _startDate = State(initialValue: task?.startDate ?? Date())
        _hasDueDate = State(initialValue: task?.dueDate != nil)
        _dueDate = State(initialValue: task?.dueDate ?? event.dueAt)
        _periodType = State(initialValue: task?.periodType ?? "once")
        _customPeriodDays = State(initialValue: max(1, task?.customPeriodDays ?? 3))
        _maxCompletionsPerPeriod = State(initialValue: max(1, task?.maxCompletionsPerPeriod ?? 1))
        _weekdayOnly = State(initialValue: task?.weekdayOnly ?? false)
    }

    private var isEditing: Bool {
        context.task != nil
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let errorMessage {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .arkCard()
                    }

                    deleteSection

                    VStack(alignment: .leading, spacing: 14) {
                        Text("任务信息")
                            .font(.title3.weight(.heavy))

                        TextField("任务标题", text: $title)
                            .textFieldStyle(.roundedBorder)

                        VStack(alignment: .leading, spacing: 6) {
                            Text("备注")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                            TextEditor(text: $content)
                                .frame(minHeight: 86)
                                .padding(8)
                                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }

                        Picker("任务类型", selection: $taskType) {
                            Text("专注任务").tag("focus")
                            Text("快速打卡").tag("checkin")
                        }
                        .pickerStyle(.segmented)
                    }
                    .arkCard()

                    VStack(alignment: .leading, spacing: 14) {
                        Text("时间")
                            .font(.title3.weight(.heavy))

                        Toggle("设置开始时间", isOn: $hasStartDate)
                        if hasStartDate {
                            DatePicker("开始时间", selection: $startDate, displayedComponents: [.date, .hourAndMinute])
                        }

                        Toggle("设置截止时间", isOn: $hasDueDate)
                        if hasDueDate {
                            DatePicker("截止时间", selection: $dueDate, displayedComponents: [.date, .hourAndMinute])
                        }
                    }
                    .arkCard()

                    completionSection
                }
                .padding(24)
                .frame(maxWidth: 720)
                .frame(maxWidth: .infinity)
            }
            .background(ArkTheme.shellBackground.ignoresSafeArea())
            .navigationTitle(isEditing ? "编辑任务" : "添加任务")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSubmitting {
                            ProgressView()
                        } else {
                            Text("保存")
                        }
                    }
                    .disabled(isSubmitting)
                }
            }
        }
    }

    @ViewBuilder
    private var deleteSection: some View {
        if isEditing {
            if isDeleteConfirmationPresented {
                EventInlineDeleteConfirmation(
                    title: "确定删除这个任务吗？",
                    message: "删除后会从当前事件安排中移除。",
                    confirmTitle: "删除任务",
                    isSubmitting: isSubmitting,
                    onCancel: { isDeleteConfirmationPresented = false },
                    onConfirm: { Task { await deleteTask() } }
                )
            } else {
                HStack {
                    Label("这个任务属于当前事件安排", systemImage: "checklist")
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(.secondary)

                    Spacer()

                    Button(role: .destructive) {
                        isDeleteConfirmationPresented = true
                    } label: {
                        Label("删除任务", systemImage: "trash")
                    }
                    .buttonStyle(.bordered)
                    .disabled(isSubmitting)
                }
                .padding(14)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        }
    }

    private var completionSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("完成规则")
                .font(.title3.weight(.heavy))

            Picker("完成周期", selection: $periodType) {
                Text("一次性").tag("once")
                Text("每天").tag("daily")
                Text("每周").tag("weekly")
                Text("每月").tag("monthly")
                Text("自定义天数").tag("custom_days")
            }
            .pickerStyle(.menu)

            if periodType == "custom_days" {
                Stepper("每 \(customPeriodDays) 天", value: $customPeriodDays, in: 1...365)
            }

            Stepper("单周期最多完成 \(maxCompletionsPerPeriod) 次", value: $maxCompletionsPerPeriod, in: 1...99)

            Toggle("仅工作日可完成", isOn: $weekdayOnly)
        }
        .arkCard()
    }

    private func save() async {
        guard let token = session.token else { return }
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else {
            errorMessage = "请输入任务标题"
            return
        }

        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            let payload = EventTaskPayload(
                title: trimmedTitle,
                content: normalizedText(content),
                status: context.task?.status ?? "todo",
                event: event.name,
                eventId: event.id,
                isRecurring: periodType != "once",
                periodType: periodType,
                customPeriodDays: periodType == "custom_days" ? customPeriodDays : nil,
                maxCompletionsPerPeriod: maxCompletionsPerPeriod,
                weekdayOnly: weekdayOnly,
                timeInheritsFromEvent: false,
                timeOverridden: false,
                taskType: taskType,
                startDate: hasStartDate ? startDate : nil,
                dueDate: hasDueDate ? dueDate : nil
            )

            if let task = context.task {
                let _: ArkTask = try await session.api.patch("/todo/tasks/\(task.id)", token: token, body: payload)
            } else {
                let _: ArkTask = try await session.api.post("/todo/tasks", token: token, body: payload)
            }
            await onChanged()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteTask() async {
        guard let token = session.token, let task = context.task else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            let _: EmptyResponse = try await session.api.delete("/todo/tasks/\(task.id)", token: token)
            await onChanged()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct EventAppointmentEditorSheet: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss

    let event: ArkEvent
    let context: EventAppointmentEditorContext
    let onChanged: () async -> Void

    @State private var title: String
    @State private var content: String
    @State private var status: String
    @State private var hasStartsAt: Bool
    @State private var startsAt: Date
    @State private var endsAt: Date
    @State private var repeatRule: String
    @State private var periodType: String
    @State private var customPeriodDays: Int
    @State private var maxCompletionsPerPeriod: Int
    @State private var weekdayOnly: Bool
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var isDeleteConfirmationPresented = false

    init(event: ArkEvent, context: EventAppointmentEditorContext, onChanged: @escaping () async -> Void) {
        self.event = event
        self.context = context
        self.onChanged = onChanged

        let appointment = context.appointment
        _title = State(initialValue: appointment?.title ?? "")
        _content = State(initialValue: appointment?.content ?? "")
        _status = State(initialValue: appointment?.status ?? "pending")
        _hasStartsAt = State(initialValue: appointment?.startsAt != nil)
        _startsAt = State(initialValue: appointment?.startsAt ?? Date())
        _endsAt = State(initialValue: appointment?.endsAt ?? event.dueAt)
        _repeatRule = State(initialValue: appointment?.repeatRule ?? "")
        _periodType = State(initialValue: appointment?.periodType ?? "once")
        _customPeriodDays = State(initialValue: max(1, appointment?.customPeriodDays ?? 3))
        _maxCompletionsPerPeriod = State(initialValue: max(1, appointment?.maxCompletionsPerPeriod ?? 1))
        _weekdayOnly = State(initialValue: appointment?.weekdayOnly ?? false)
    }

    private var isEditing: Bool {
        context.appointment != nil
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let errorMessage {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .arkCard()
                    }

                    deleteSection

                    VStack(alignment: .leading, spacing: 14) {
                        Text("日程信息")
                            .font(.title3.weight(.heavy))

                        TextField("日程标题", text: $title)
                            .textFieldStyle(.roundedBorder)

                        Picker("状态", selection: $status) {
                            Text("待出席").tag("pending")
                            Text("已出席").tag("attended")
                            Text("已错过").tag("missed")
                            Text("已取消").tag("cancelled")
                        }
                        .pickerStyle(.segmented)

                        VStack(alignment: .leading, spacing: 6) {
                            Text("备注")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                            TextEditor(text: $content)
                                .frame(minHeight: 86)
                                .padding(8)
                                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                    }
                    .arkCard()

                    VStack(alignment: .leading, spacing: 14) {
                        Text("时间")
                            .font(.title3.weight(.heavy))

                        Toggle("设置开始时间", isOn: $hasStartsAt)
                        if hasStartsAt {
                            DatePicker("开始时间", selection: $startsAt, displayedComponents: [.date, .hourAndMinute])
                        }

                        DatePicker("结束时间", selection: $endsAt, displayedComponents: [.date, .hourAndMinute])

                        TextField("重复规则，例如 weekly", text: $repeatRule)
                            .textFieldStyle(.roundedBorder)
                    }
                    .arkCard()

                    completionSection
                }
                .padding(24)
                .frame(maxWidth: 720)
                .frame(maxWidth: .infinity)
            }
            .background(ArkTheme.shellBackground.ignoresSafeArea())
            .navigationTitle(isEditing ? "编辑日程" : "添加日程")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSubmitting {
                            ProgressView()
                        } else {
                            Text("保存")
                        }
                    }
                    .disabled(isSubmitting)
                }
            }
        }
    }

    @ViewBuilder
    private var deleteSection: some View {
        if isEditing {
            if isDeleteConfirmationPresented {
                EventInlineDeleteConfirmation(
                    title: "确定删除这个日程吗？",
                    message: "删除后会从当前事件安排中移除。",
                    confirmTitle: "删除日程",
                    isSubmitting: isSubmitting,
                    onCancel: { isDeleteConfirmationPresented = false },
                    onConfirm: { Task { await deleteAppointment() } }
                )
            } else {
                HStack {
                    Label("这个日程属于当前事件安排", systemImage: "calendar.badge.clock")
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(.secondary)

                    Spacer()

                    Button(role: .destructive) {
                        isDeleteConfirmationPresented = true
                    } label: {
                        Label("删除日程", systemImage: "trash")
                    }
                    .buttonStyle(.bordered)
                    .disabled(isSubmitting)
                }
                .padding(14)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        }
    }

    private var completionSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("完成规则")
                .font(.title3.weight(.heavy))

            Picker("完成周期", selection: $periodType) {
                Text("一次性").tag("once")
                Text("每天").tag("daily")
                Text("每周").tag("weekly")
                Text("每月").tag("monthly")
                Text("自定义天数").tag("custom_days")
            }
            .pickerStyle(.menu)

            if periodType == "custom_days" {
                Stepper("每 \(customPeriodDays) 天", value: $customPeriodDays, in: 1...365)
            }

            Stepper("单周期最多完成 \(maxCompletionsPerPeriod) 次", value: $maxCompletionsPerPeriod, in: 1...99)

            Toggle("仅工作日可完成", isOn: $weekdayOnly)
        }
        .arkCard()
    }

    private func save() async {
        guard let token = session.token else { return }
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else {
            errorMessage = "请输入日程标题"
            return
        }

        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            let payload = EventAppointmentPayload(
                title: trimmedTitle,
                content: normalizedText(content),
                status: status,
                startsAt: hasStartsAt ? startsAt : nil,
                endsAt: endsAt,
                repeatRule: normalizedText(repeatRule),
                eventId: event.id,
                isRecurring: periodType != "once",
                periodType: periodType,
                customPeriodDays: periodType == "custom_days" ? customPeriodDays : nil,
                maxCompletionsPerPeriod: maxCompletionsPerPeriod,
                weekdayOnly: weekdayOnly,
                timeInheritsFromEvent: false,
                timeOverridden: false
            )

            if let appointment = context.appointment {
                let _: ArkAppointment = try await session.api.patch(
                    "/todo/appointments/\(appointment.id)",
                    token: token,
                    body: payload
                )
            } else {
                let _: ArkAppointment = try await session.api.post("/todo/appointments", token: token, body: payload)
            }
            await onChanged()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteAppointment() async {
        guard let token = session.token, let appointment = context.appointment else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            let _: EmptyResponse = try await session.api.delete("/todo/appointments/\(appointment.id)", token: token)
            await onChanged()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct EventWorkflowEditorSheet: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss

    let event: ArkEvent
    let tasks: [ArkTask]
    let context: EventWorkflowEditorContext
    let onChanged: () async -> Void

    @State private var name: String
    @State private var icon: String
    @State private var phases: [EventWorkflowPhaseDraft]
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var isDeleteConfirmationPresented = false
    @State private var activeStageIndex = 0

    init(event: ArkEvent, tasks: [ArkTask], context: EventWorkflowEditorContext, onChanged: @escaping () async -> Void) {
        self.event = event
        self.tasks = tasks
        self.context = context
        self.onChanged = onChanged

        let baseName = context.workflow?.name ?? ""
        _name = State(initialValue: context.isCopy ? "\(baseName)（副本）" : baseName)
        _icon = State(initialValue: context.workflow?.icon ?? "file")
        _phases = State(initialValue: EventWorkflowEditorSheet.makeDrafts(workflow: context.workflow, tasks: tasks))
    }

    private var isEditing: Bool {
        context.workflow != nil && !context.isCopy
    }

    private var availableTasks: [ArkTask] {
        tasks.filter { !$0.isDone }
    }

    private var stageCount: Int {
        phases.count / 2
    }

    private var workflowIconOptions: [(id: String, systemImage: String, label: String)] {
        [
            ("file", "doc.text", "文件"),
            ("coffee", "cup.and.saucer", "咖啡"),
            ("book", "book", "阅读"),
            ("headphones", "headphones", "听力")
        ]
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let errorMessage {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .arkCard()
                    }

                    if isEditing {
                        deleteSection
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        Text("工作流信息")
                            .font(.title3.weight(.heavy))

                        TextField("工作流名称", text: $name)
                            .textFieldStyle(.roundedBorder)
                            .onChange(of: name) { _, value in
                                if value.count > 50 {
                                    name = String(value.prefix(50))
                                }
                            }

                        Text(workflowSummary)
                            .font(.callout)
                            .foregroundStyle(.secondary)

                        VStack(alignment: .leading, spacing: 8) {
                            Text("工作流图标")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)

                            HStack(spacing: 10) {
                                ForEach(workflowIconOptions, id: \.id) { option in
                                    Button {
                                        icon = option.id
                                    } label: {
                                        Image(systemName: option.systemImage)
                                            .font(.headline)
                                            .frame(width: 42, height: 42)
                                            .background(icon == option.id ? ArkTheme.accent.opacity(0.18) : Color.secondary.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                            .overlay {
                                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                                    .stroke(icon == option.id ? ArkTheme.accent : Color.clear, lineWidth: 2)
                                            }
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel(option.label)
                                }
                            }
                        }
                    }
                    .arkCard()

                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("流程编辑")
                                    .font(.title3.weight(.heavy))
                                Text("共 \(stageCount) 个阶段")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()

                            Button {
                                addPhasePair()
                            } label: {
                                Label("添加学习阶段", systemImage: "plus")
                            }
                            .buttonStyle(.bordered)
                        }

                        stageOverview
                        stageHint
                        stageDetailEditor(stageIndex: activeStageIndex)
                    }
                    .arkCard()
                }
                .padding(24)
                .frame(maxWidth: 860)
                .frame(maxWidth: .infinity)
            }
            .background(ArkTheme.shellBackground.ignoresSafeArea())
            .navigationTitle(isEditing ? "编辑工作流" : context.isCopy ? "复制工作流" : "新建工作流")
            .onChange(of: phases.count) { _, _ in
                activeStageIndex = min(activeStageIndex, max(0, stageCount - 1))
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSubmitting {
                            ProgressView()
                        } else {
                            Text("保存")
                        }
                    }
                    .disabled(isSubmitting)
                }
            }
        }
    }

    @ViewBuilder
    private var deleteSection: some View {
        if isDeleteConfirmationPresented {
            EventInlineDeleteConfirmation(
                title: "确定删除该工作流吗？",
                message: "删除后会从当前事件安排中移除。",
                confirmTitle: "删除工作流",
                isSubmitting: isSubmitting,
                onCancel: { isDeleteConfirmationPresented = false },
                onConfirm: { Task { await deleteWorkflow() } }
            )
        } else {
            HStack {
                Label("这个工作流属于当前事件安排", systemImage: "timer")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(.secondary)

                Spacer()

                Button(role: .destructive) {
                    isDeleteConfirmationPresented = true
                } label: {
                    Label("删除工作流", systemImage: "trash")
                }
                .buttonStyle(.bordered)
                .disabled(isSubmitting)
            }
            .padding(14)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }

    private var workflowSummary: String {
        let focusMinutes = phases
            .filter { $0.phaseType == "focus" }
            .reduce(0) { $0 + $1.durationMinutes }
        let breakMinutes = phases
            .filter { $0.phaseType == "break" }
            .reduce(0) { $0 + $1.durationMinutes }
        return "共 \(stageCount) 个阶段 · 总时长 \(focusMinutes + breakMinutes) 分钟 · 专注 \(focusMinutes) 分钟 · 休息 \(breakMinutes) 分钟"
    }

    private var stageOverview: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(Array(0..<stageCount), id: \.self) { stageIndex in
                    if stageIndex > 0 {
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.secondary)
                    }

                    stageCard(stageIndex: stageIndex)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var stageHint: some View {
        HStack(spacing: 16) {
            Label("专注时长", systemImage: "target")
                .foregroundStyle(ArkTheme.accent)
            Label("休息时长", systemImage: "cup.and.saucer.fill")
                .foregroundStyle(ArkTheme.success)
            Spacer()
            Text("点击阶段卡片可编辑")
                .foregroundStyle(.secondary)
        }
        .font(.caption.weight(.semibold))
    }

    private func stageCard(stageIndex: Int) -> some View {
        let focusIndex = stageIndex * 2
        let breakIndex = focusIndex + 1
        let focusPhase = phases[focusIndex]
        let breakPhase = phases[breakIndex]
        let isActive = activeStageIndex == stageIndex

        return Button {
            activeStageIndex = stageIndex
        } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Text("\(stageIndex + 1)")
                        .font(.caption.weight(.heavy))
                        .foregroundStyle(.white)
                        .frame(width: 24, height: 24)
                        .background(stageBadgeColor(stageIndex), in: Circle())

                    Text(taskTitle(for: focusPhase))
                        .font(.callout.weight(.semibold))
                        .lineLimit(1)
                        .foregroundStyle(.primary)
                }

                HStack(spacing: 8) {
                    Label("\(focusPhase.durationMinutes)min", systemImage: "target")
                        .foregroundStyle(ArkTheme.accent)
                    Label("休息 \(breakPhase.durationMinutes)min", systemImage: "cup.and.saucer.fill")
                        .foregroundStyle(ArkTheme.success)
                }
                .font(.caption.weight(.semibold))
            }
            .frame(width: 190, alignment: .leading)
            .padding(14)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(isActive ? ArkTheme.accent : Color.clear, lineWidth: 2)
            }
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func stageDetailEditor(stageIndex: Int) -> some View {
        let focusIndex = stageIndex * 2
        let breakIndex = focusIndex + 1

        if phases.indices.contains(focusIndex), phases.indices.contains(breakIndex) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("正在编辑：阶段 \(stageIndex + 1) · \(taskTitle(for: phases[focusIndex]))")
                            .font(.headline)
                            .foregroundStyle(ArkTheme.accent)
                        Text("该阶段会先专注，然后进入休息，再继续下一阶段。")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Button(role: .destructive) {
                        removePhasePair(stageIndex: stageIndex)
                    } label: {
                        Label("删除阶段", systemImage: "trash")
                    }
                    .buttonStyle(.bordered)
                    .disabled(stageCount <= 1)
                }

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("绑定任务")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Picker("绑定任务", selection: Binding(
                            get: { phases[focusIndex].taskId ?? "" },
                            set: { value in
                                phases[focusIndex].taskId = value.isEmpty ? nil : value
                                if !value.isEmpty {
                                    phases[focusIndex].focusWorkType = nil
                                }
                            }
                        )) {
                            Text("运行时选择任务").tag("")
                            ForEach(availableTasks) { task in
                                Text(task.title).tag(task.id)
                            }
                        }
                        .pickerStyle(.menu)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("计时方式")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Picker("计时方式", selection: Binding(
                            get: { phases[focusIndex].timerMode },
                            set: { phases[focusIndex].timerMode = $0 }
                        )) {
                            Text("倒计时").tag("countdown")
                            Text("正计时").tag("countup")
                        }
                        .pickerStyle(.segmented)
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("专注时长（分钟）")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        if phases[focusIndex].timerMode == "countup" {
                            Text("正计时阶段不需要单独设置时长")
                                .font(.callout.weight(.semibold))
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                                .padding(.horizontal, 12)
                                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        } else {
                            Stepper(
                                "\(phases[focusIndex].durationMinutes) 分钟",
                                value: Binding(
                                    get: { phases[focusIndex].durationMinutes },
                                    set: { phases[focusIndex].durationMinutes = max(1, $0) }
                                ),
                                in: 1...240,
                                step: 5
                            )
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        }
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("结束后休息（分钟）")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Stepper(
                            "\(phases[breakIndex].durationMinutes) 分钟",
                            value: Binding(
                                get: { phases[breakIndex].durationMinutes },
                                set: { phases[breakIndex].durationMinutes = max(1, $0) }
                            ),
                            in: 1...240,
                            step: 5
                        )
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                }

                Text("该阶段将先专注 \(focusDurationText(for: phases[focusIndex]))，结束后休息 \(phases[breakIndex].durationMinutes) 分钟。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }

    private func addPhasePair() {
        let nextStageIndex = stageCount
        phases.append(EventWorkflowPhaseDraft(phaseType: "focus", durationMinutes: 5, timerMode: "countdown"))
        phases.append(EventWorkflowPhaseDraft(phaseType: "break", durationMinutes: 5, timerMode: "countdown"))
        activeStageIndex = nextStageIndex
    }

    private func removePhasePair(stageIndex: Int) {
        guard stageCount > 1 else { return }
        let start = stageIndex * 2
        let end = min(start + 1, phases.count - 1)
        guard phases.indices.contains(start), phases.indices.contains(end) else { return }
        phases.removeSubrange(start...end)
        activeStageIndex = min(activeStageIndex, max(0, stageCount - 1))
    }

    private func save() async {
        guard let token = session.token else { return }
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            errorMessage = "请输入工作流名称"
            return
        }
        guard let payload = makePayload(name: trimmedName) else { return }

        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            if let workflow = context.workflow, !context.isCopy {
                let _: WorkflowPreset = try await session.api.patch(
                    "/todo/events/\(event.id)/workflows/\(workflow.id)",
                    token: token,
                    body: payload
                )
            } else {
                let _: WorkflowPreset = try await session.api.post(
                    "/todo/events/\(event.id)/workflows",
                    token: token,
                    body: payload
                )
            }
            await onChanged()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteWorkflow() async {
        guard let token = session.token, let workflow = context.workflow, !context.isCopy else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            let _: EmptyResponse = try await session.api.delete("/todo/events/\(event.id)/workflows/\(workflow.id)", token: token)
            await onChanged()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func makePayload(name: String) -> EventWorkflowPayload? {
        guard !phases.isEmpty else {
            errorMessage = "至少配置一个阶段"
            return nil
        }
        guard phases.first?.phaseType == "focus" else {
            errorMessage = "第一个阶段必须是专注"
            return nil
        }
        guard phases.count % 2 == 0 else {
            errorMessage = "每个学习阶段必须包含专注和休息"
            return nil
        }
        for index in phases.indices {
            if phases[index].durationMinutes < 1 {
                errorMessage = "每个阶段时长不能小于 1 分钟"
                return nil
            }
            if index > 0, phases[index - 1].phaseType == phases[index].phaseType {
                errorMessage = "相邻阶段必须交替专注和休息"
                return nil
            }
        }

        let payloadPhases = phases.map { phase in
            EventWorkflowPhasePayload(
                phaseType: phase.phaseType,
                duration: phase.durationMinutes * 60,
                timerMode: phase.phaseType == "focus" ? phase.timerMode : nil,
                taskId: phase.phaseType == "focus" ? phase.taskId : nil,
                focusWorkType: phase.phaseType == "focus" && phase.taskId == nil ? phase.focusWorkType : nil
            )
        }
        let firstFocus = phases.first(where: { $0.phaseType == "focus" })
        let firstBreak = phases.first(where: { $0.phaseType == "break" })

        return EventWorkflowPayload(
            name: name,
            icon: icon,
            phases: payloadPhases,
            focusDuration: max(60, (firstFocus?.durationMinutes ?? 25) * 60),
            breakDuration: max(60, (firstBreak?.durationMinutes ?? 5) * 60),
            defaultFocusTimerMode: firstFocus?.timerMode ?? "countdown",
            isDefault: context.isCopy ? false : (context.workflow?.isDefault ?? false)
        )
    }

    private static func makeDrafts(workflow: WorkflowPreset?, tasks: [ArkTask]) -> [EventWorkflowPhaseDraft] {
        let sourcePhases: [WorkflowPresetPhase]
        if let phases = workflow?.phases, !phases.isEmpty {
            sourcePhases = phases
        } else {
            sourcePhases = [
                WorkflowPresetPhase(
                    phaseType: "focus",
                    duration: workflow?.focusDuration ?? 25 * 60,
                    timerMode: workflow?.defaultFocusTimerMode ?? "countdown",
                    taskId: nil,
                    focusWorkType: nil
                ),
                WorkflowPresetPhase(
                    phaseType: "break",
                    duration: workflow?.breakDuration ?? 5 * 60,
                    timerMode: "countdown",
                    taskId: nil,
                    focusWorkType: nil
                )
            ]
        }

        var drafts = sourcePhases.enumerated().map { index, phase in
            let phaseType = index.isMultiple(of: 2) ? "focus" : "break"
            let mappedTaskId = phase.taskId ?? phase.focusWorkType.flatMap { focusWorkType in
                tasks.first(where: { $0.appTaskType == focusWorkType })?.id
            }
            return EventWorkflowPhaseDraft(
                phaseType: phaseType,
                durationMinutes: max(1, Int((Double(phase.duration) / 60).rounded())),
                timerMode: phase.timerMode ?? workflow?.defaultFocusTimerMode ?? "countdown",
                taskId: phaseType == "focus" ? mappedTaskId : nil,
                focusWorkType: phaseType == "focus" && mappedTaskId == nil ? phase.focusWorkType : nil
            )
        }

        if drafts.isEmpty {
            drafts = [
                EventWorkflowPhaseDraft(phaseType: "focus", durationMinutes: 25, timerMode: "countdown"),
                EventWorkflowPhaseDraft(phaseType: "break", durationMinutes: 5, timerMode: "countdown")
            ]
        } else if drafts.count % 2 != 0 {
            drafts.append(EventWorkflowPhaseDraft(phaseType: "break", durationMinutes: 5, timerMode: "countdown"))
        }

        return drafts
    }

    private func taskTitle(for phase: EventWorkflowPhaseDraft) -> String {
        if let taskId = phase.taskId,
           let task = tasks.first(where: { $0.id == taskId }) {
            return task.title
        }

        switch phase.focusWorkType {
        case "vocab_today":
            return "今日单词"
        case "erc_practice":
            return "ERC 真题练习"
        case "erc_review":
            return "ERC 复习"
        default:
            return "运行时选择任务"
        }
    }

    private func focusDurationText(for phase: EventWorkflowPhaseDraft) -> String {
        phase.timerMode == "countup" ? "正计时" : "\(phase.durationMinutes) 分钟"
    }

    private func stageBadgeColor(_ index: Int) -> Color {
        switch index % 5 {
        case 0:
            return ArkTheme.accent
        case 1:
            return ArkTheme.success
        case 2:
            return .purple
        case 3:
            return .orange
        default:
            return .cyan
        }
    }
}

private struct EventWorkflowPhaseDraft: Identifiable {
    let id = UUID()
    var phaseType: String
    var durationMinutes: Int
    var timerMode: String
    var taskId: String?
    var focusWorkType: String?
}

private struct EventTaskColumn: View {
    let tasks: [ArkTask]
    let onAdd: () -> Void
    let onEdit: (ArkTask) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("任务")
                .font(.headline)

            if tasks.isEmpty {
                EventColumnEmptyText("暂无任务")
            } else {
                ForEach(tasks) { task in
                    EventTaskRow(
                        task: task,
                        onEdit: task.managedByApp ? nil : { onEdit(task) }
                    )
                }
            }

            Button(action: onAdd) {
                Label("添加任务", systemImage: "plus")
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .padding(14)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private struct EventAppointmentColumn: View {
    let appointments: [ArkAppointment]
    let onAdd: () -> Void
    let onEdit: (ArkAppointment) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("日程")
                .font(.headline)

            if appointments.isEmpty {
                EventColumnEmptyText("暂无日程")
            } else {
                ForEach(appointments) { appointment in
                    Button {
                        onEdit(appointment)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(appointment.title)
                                .font(.callout.weight(.semibold))
                                .lineLimit(1)
                            Text("\(formatEventDateTime(appointment.startsAt ?? appointment.endsAt)) - \(formatEventDateTime(appointment.endsAt))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }

            Button(action: onAdd) {
                Label("添加日程", systemImage: "plus")
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .padding(14)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private struct EventTaskRow: View {
    let task: ArkTask
    let onEdit: (() -> Void)?

    var body: some View {
        Button {
            onEdit?()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: task.appTaskType == nil ? "checklist" : "sparkle.magnifyingglass")
                    .foregroundStyle(task.appTaskType == nil ? ArkTheme.accent : ArkTheme.success)
                    .frame(width: 28, height: 28)
                    .background((task.appTaskType == nil ? ArkTheme.accent : ArkTheme.success).opacity(0.12), in: Circle())

                VStack(alignment: .leading, spacing: 4) {
                    Text(task.title)
                        .font(.callout.weight(.semibold))
                        .lineLimit(1)
                    Text(task.dueDate.map { formatEventDateTime($0) } ?? "未设时间")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                if task.appTaskType != nil {
                    Text("托管")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(ArkTheme.accent)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 4)
                        .background(ArkTheme.accent.opacity(0.12), in: Capsule())
                } else {
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(12)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(onEdit == nil)
    }
}

private struct EventWorkflowColumn: View {
    let workflows: [WorkflowPreset]
    let tasks: [ArkTask]
    let onNew: () -> Void
    let onEdit: (WorkflowPreset) -> Void
    let onCopy: (WorkflowPreset) -> Void
    let onDelete: (WorkflowPreset) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("工作流")
                .font(.headline)

            if workflows.isEmpty {
                EventColumnEmptyText("暂无工作流")
            } else {
                ForEach(workflows) { workflow in
                    HStack(alignment: .center, spacing: 10) {
                        Button {
                            onEdit(workflow)
                        } label: {
                            VStack(alignment: .leading, spacing: 10) {
                                Text(workflow.name)
                                    .font(.callout.weight(.bold))
                                    .lineLimit(1)

                                if let phases = workflow.phases, !phases.isEmpty {
                                    ScrollView(.horizontal, showsIndicators: false) {
                                        HStack(spacing: 6) {
                                            ForEach(Array(phases.enumerated()), id: \.element.id) { index, phase in
                                                EventWorkflowPhaseChip(
                                                    phase: phase,
                                                    title: phase.taskId.flatMap(taskTitle) ?? phaseDisplayTitle(phase),
                                                    showArrow: index < phases.count - 1
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .buttonStyle(.plain)

                        Button {
                            onEdit(workflow)
                        } label: {
                            Label("编辑", systemImage: "pencil")
                                .labelStyle(.iconOnly)
                        }
                        .buttonStyle(.bordered)

                        Button {
                            onCopy(workflow)
                        } label: {
                            Label("复制", systemImage: "doc.on.doc")
                                .labelStyle(.iconOnly)
                        }
                        .buttonStyle(.bordered)

                        Button(role: .destructive) {
                            onDelete(workflow)
                        } label: {
                            Label("删除", systemImage: "trash")
                                .labelStyle(.iconOnly)
                        }
                        .buttonStyle(.bordered)
                    }
                    .padding(12)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
            }

            Button(action: onNew) {
                Label("新建工作流", systemImage: "plus")
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.bordered)
        }
        .padding(14)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func taskTitle(_ taskId: String) -> String? {
        tasks.first(where: { $0.id == taskId })?.title
    }
}

private struct EventWorkflowPhaseChip: View {
    let phase: WorkflowPresetPhase
    let title: String
    let showArrow: Bool

    var body: some View {
        HStack(spacing: 6) {
            Text("\(phaseIcon) \(phase.duration / 60)m\(title.isEmpty ? "" : " | \(title)")")
                .font(.caption.weight(.bold))
                .lineLimit(1)
                .padding(.horizontal, 9)
                .padding(.vertical, 6)
                .background(chipTint.opacity(0.13), in: Capsule())
                .foregroundStyle(chipTint)

            if showArrow {
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var phaseIcon: String {
        phase.phaseType == "break" ? "☕" : "🎯"
    }

    private var chipTint: Color {
        phase.phaseType == "break" ? ArkTheme.success : ArkTheme.accent
    }
}

private struct EventAppConfigSheet: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss

    let tasks: [ArkTask]
    let event: ArkEvent
    let onChanged: () async -> Void

    @State private var decks: [VocabDeck] = []
    @State private var vocabStatus: AppTaskStatus?
    @State private var ercStatus: ERCConfigStatus?
    @State private var activeAppType: String?
    @State private var editingTaskId: String?
    @State private var deckId = ""
    @State private var dailyTargetCount = 20
    @State private var dailyArticleTarget = 1
    @State private var reviewScope = "due"
    @State private var focusDurationMin = 25
    @State private var dailyQuestionTarget = 10
    @State private var addToTodayPlan = true
    @State private var isLoading = false
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var isDeleteConfirmationPresented = false

    private let appTypes: [(type: String, title: String)] = [
        ("vocab_today", "今日单词"),
        ("erc_practice", "真题练习"),
        ("erc_review", "错题复习")
    ]

    private var usedTypes: Set<String> {
        Set(tasks.compactMap(\.appTaskType))
    }

    private var availableTypes: [(type: String, title: String)] {
        appTypes.filter { !usedTypes.contains($0.type) || $0.type == activeAppType }
    }

    private var orderedTasks: [ArkTask] {
        tasks.sorted { lhs, rhs in
            appOrder(lhs.appTaskType) < appOrder(rhs.appTaskType)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if let errorMessage {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .arkCard()
                    }

                    if isLoading {
                        ProgressView("应用配置加载中...")
                            .frame(maxWidth: .infinity, minHeight: 80)
                            .arkCard()
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text("应用配置")
                            .font(.title3.weight(.heavy))
                        Text(event.name)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }

                    if let activeAppType {
                        appConfigEditor(appType: activeAppType)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(orderedTasks) { task in
                            appConfigRow(task)
                        }

                        if activeAppType == nil, let nextType = availableTypes.first {
                            Button {
                                beginConfigureApp(type: nextType.type, task: nil)
                            } label: {
                                Label("添加应用", systemImage: "plus")
                                    .frame(maxWidth: .infinity, minHeight: 42)
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                    .arkCard()
                }
                .padding(24)
                .frame(maxWidth: 720)
                .frame(maxWidth: .infinity)
            }
            .background(ArkTheme.shellBackground.ignoresSafeArea())
            .navigationTitle("应用配置")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("关闭") { dismiss() }
                }
            }
            .task(id: event.id) {
                await loadConfigs()
            }
        }
        .presentationDetents([.large])
    }

    private func appConfigRow(_ task: ArkTask) -> some View {
        Button {
            beginConfigureApp(type: task.appTaskType ?? "vocab_today", task: task)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: appIcon(task.appTaskType))
                    .foregroundStyle(ArkTheme.accent)
                    .frame(width: 30, height: 30)
                    .background(ArkTheme.accent.opacity(0.12), in: Circle())

                VStack(alignment: .leading, spacing: 4) {
                    Text(appLabel(task.appTaskType))
                        .font(.callout.weight(.semibold))
                    Text(appConfigSummary(type: task.appTaskType, task: task))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                Text("托管")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(ArkTheme.accent)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .background(ArkTheme.accent.opacity(0.12), in: Capsule())
            }
            .padding(12)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func appConfigEditor(appType: String) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(editingTaskId == nil ? "添加应用" : "编辑应用")
                        .font(.headline)
                    Text(appLabel(appType))
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Button("取消") {
                    resetEditor()
                }
                .buttonStyle(.bordered)
                .disabled(isSubmitting)
            }

            if editingTaskId == nil {
                Picker("选择应用", selection: Binding(
                    get: { activeAppType ?? appType },
                    set: { beginConfigureApp(type: $0, task: nil) }
                )) {
                    ForEach(availableTypes, id: \.type) { app in
                        Text(app.title).tag(app.type)
                    }
                }
                .pickerStyle(.menu)
            }

            if appType == "vocab_today" {
                Picker("选择词书", selection: $deckId) {
                    Text("选择词书").tag("")
                    ForEach(decks) { deck in
                        Text("\(deck.name)（\(deck.wordCount ?? 0) 词）").tag(deck.id)
                    }
                }
                .pickerStyle(.menu)

                Stepper("每日目标 \(dailyTargetCount) 词", value: $dailyTargetCount, in: 1...500)
            } else if appType == "erc_practice" {
                Stepper("每日目标 \(dailyArticleTarget) 篇", value: $dailyArticleTarget, in: 1...50)
            } else {
                Picker("复习范围", selection: $reviewScope) {
                    Text("到期复习").tag("due")
                    Text("全部错题").tag("mistakes")
                    Text("全部题目").tag("all")
                }
                .pickerStyle(.segmented)

                Stepper("每日目标 \(dailyQuestionTarget) 题", value: $dailyQuestionTarget, in: 1...200)
            }

            Stepper("默认专注 \(focusDurationMin) 分钟", value: $focusDurationMin, in: 1...240)

            Toggle("同步到今日计划", isOn: $addToTodayPlan)

            if isDeleteConfirmationPresented {
                EventInlineDeleteConfirmation(
                    title: "确定删除该应用配置吗？",
                    message: "删除后对应托管任务会从当前事件安排中移除。",
                    confirmTitle: "删除配置",
                    isSubmitting: isSubmitting,
                    onCancel: { isDeleteConfirmationPresented = false },
                    onConfirm: { Task { await deleteAppConfig() } }
                )
            }

            HStack {
                if editingTaskId != nil, !isDeleteConfirmationPresented {
                    Button(role: .destructive) {
                        isDeleteConfirmationPresented = true
                    } label: {
                        Label("删除", systemImage: "trash")
                    }
                    .buttonStyle(.bordered)
                    .disabled(isSubmitting)
                }

                Spacer()

                Button {
                    Task { await saveAppConfig() }
                } label: {
                    if isSubmitting {
                        ProgressView()
                    } else {
                        Text("保存")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(isSubmitting)
            }
        }
        .arkCard()
    }

    private func loadConfigs() async {
        guard let token = session.token else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            async let deckResponse: [VocabDeck] = session.api.get("/api/vocab/decks", token: token)
            async let vocabResponse: AppTaskStatus = session.api.get("/todo/app-tasks/vocab/status", token: token)
            async let ercResponse: ERCConfigStatus = session.api.get(
                "/todo/app-tasks/erc-config?event_id=\(event.id)",
                token: token
            )

            decks = (try? await deckResponse) ?? []
            vocabStatus = try? await vocabResponse
            ercStatus = try? await ercResponse

            if activeAppType == "vocab_today", deckId.isEmpty {
                deckId = decks.first?.id ?? ""
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func beginConfigureApp(type: String, task: ArkTask?) {
        activeAppType = type
        editingTaskId = task?.id
        isDeleteConfirmationPresented = false
        errorMessage = nil

        let config = configFor(type: type, task: task)
        deckId = configString(config, keys: ["deck_id", "deckId"]) ?? decks.first?.id ?? ""
        dailyTargetCount = configInt(config, keys: ["daily_target_count", "dailyTargetCount"], fallback: 20)
        dailyArticleTarget = configInt(config, keys: ["daily_article_target", "dailyArticleTarget"], fallback: 1)
        let configuredReviewScope = configString(config, keys: ["review_scope", "reviewScope"]) ?? "due"
        reviewScope = ["due", "mistakes", "all"].contains(configuredReviewScope) ? configuredReviewScope : "due"
        dailyQuestionTarget = configInt(config, keys: ["daily_question_target", "dailyQuestionTarget"], fallback: 10)
        focusDurationMin = max(1, configInt(config, keys: ["default_focus_duration", "defaultFocusDuration"], fallback: 1500) / 60)
        addToTodayPlan = configBool(config, keys: ["add_to_today_plan", "addToTodayPlan"], fallback: true)
    }

    private func saveAppConfig() async {
        guard let token = session.token, let activeAppType else { return }
        if activeAppType == "vocab_today", deckId.isEmpty {
            errorMessage = "请选择词书"
            return
        }

        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            if activeAppType == "vocab_today" {
                let payload = VocabAppTaskPayload(
                    deckId: deckId,
                    dailyTargetCount: dailyTargetCount,
                    defaultFocusDuration: focusDurationMin * 60,
                    addToTodayPlan: addToTodayPlan,
                    eventId: event.id
                )
                let _: AppTaskStatus = try await session.api.post("/todo/app-tasks/vocab/init", token: token, body: payload)
            } else {
                let status: ERCConfigStatus
                if let ercStatus {
                    status = ercStatus
                } else {
                    status = try await session.api.get("/todo/app-tasks/erc-config?event_id=\(event.id)", token: token)
                }
                let payload = makeERCPayload(status: status, activeAppType: activeAppType)
                let updated: ERCConfigStatus = try await session.api.post(
                    "/todo/app-tasks/erc-config",
                    token: token,
                    body: payload
                )
                ercStatus = updated
            }

            await loadConfigs()
            await onChanged()
            resetEditor()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deleteAppConfig() async {
        guard let token = session.token, let editingTaskId else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            let _: EmptyResponse = try await session.api.delete("/todo/tasks/\(editingTaskId)", token: token)
            await loadConfigs()
            await onChanged()
            resetEditor()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func resetEditor() {
        activeAppType = nil
        editingTaskId = nil
        isDeleteConfirmationPresented = false
    }

    private func makeERCPayload(status: ERCConfigStatus, activeAppType: String) -> ERCConfigSavePayload {
        let practice = activeAppType == "erc_practice"
            ? ERCPracticeConfigPayload(
                dailyArticleTarget: dailyArticleTarget,
                defaultFocusDuration: focusDurationMin * 60,
                addToTodayPlan: addToTodayPlan
            )
            : practicePayload(from: status.practice)
        let review = activeAppType == "erc_review"
            ? ERCReviewConfigPayload(
                reviewScope: reviewScope,
                dailyQuestionTarget: dailyQuestionTarget,
                defaultFocusDuration: focusDurationMin * 60,
                addToTodayPlan: addToTodayPlan
            )
            : reviewPayload(from: status.review)

        return ERCConfigSavePayload(
            eventId: event.id,
            practiceEnabled: activeAppType == "erc_practice" || status.practice.enabled,
            reviewEnabled: activeAppType == "erc_review" || status.review.enabled,
            practice: practice,
            review: review
        )
    }

    private func practicePayload(from module: ERCModuleStatus) -> ERCPracticeConfigPayload {
        ERCPracticeConfigPayload(
            dailyArticleTarget: configInt(module.config, keys: ["daily_article_target", "dailyArticleTarget"], fallback: 1),
            defaultFocusDuration: configInt(module.config, keys: ["default_focus_duration", "defaultFocusDuration"], fallback: 1500),
            addToTodayPlan: configBool(module.config, keys: ["add_to_today_plan", "addToTodayPlan"], fallback: true)
        )
    }

    private func reviewPayload(from module: ERCModuleStatus) -> ERCReviewConfigPayload {
        let scope = configString(module.config, keys: ["review_scope", "reviewScope"]) ?? "due"
        return ERCReviewConfigPayload(
            reviewScope: ["due", "mistakes", "all"].contains(scope) ? scope : "due",
            dailyQuestionTarget: configInt(module.config, keys: ["daily_question_target", "dailyQuestionTarget"], fallback: 10),
            defaultFocusDuration: configInt(module.config, keys: ["default_focus_duration", "defaultFocusDuration"], fallback: 1500),
            addToTodayPlan: configBool(module.config, keys: ["add_to_today_plan", "addToTodayPlan"], fallback: true)
        )
    }

    private func configFor(type: String, task: ArkTask?) -> [String: JSONPrimitive] {
        if type == "vocab_today" {
            return vocabStatus?.config ?? parseAppTaskContent(task)
        }
        if type == "erc_practice" {
            return ercStatus?.practice.config ?? parseAppTaskContent(task)
        }
        if type == "erc_review" {
            return ercStatus?.review.config ?? parseAppTaskContent(task)
        }
        return parseAppTaskContent(task)
    }

    private func appConfigSummary(type: String?, task: ArkTask) -> String {
        let config = configFor(type: type ?? "", task: task)
        var parts: [String] = []

        if type == "vocab_today" {
            if let configuredDeckId = configString(config, keys: ["deck_id", "deckId"]),
               let deck = decks.first(where: { $0.id == configuredDeckId || $0.key == configuredDeckId }) {
                parts.append("词书 \(deck.name)")
            }
            let count = configInt(config, keys: ["daily_target_count", "dailyTargetCount"], fallback: 0)
            if count > 0 { parts.append("每日 \(count) 词") }
        } else if type == "erc_practice" {
            let count = configInt(config, keys: ["daily_article_target", "dailyArticleTarget"], fallback: 0)
            if count > 0 { parts.append("每日 \(count) 篇") }
        } else if type == "erc_review" {
            if let scope = configString(config, keys: ["review_scope", "reviewScope"]) {
                parts.append(scope == "due" ? "到期复习" : scope == "mistakes" ? "错题复习" : "全部题目")
            }
            let count = configInt(config, keys: ["daily_question_target", "dailyQuestionTarget"], fallback: 0)
            if count > 0 { parts.append("每日 \(count) 题") }
        }

        let duration = configInt(config, keys: ["default_focus_duration", "defaultFocusDuration"], fallback: 0)
        if duration > 0 {
            parts.append("专注 \(max(1, duration / 60))m")
        }
        return parts.isEmpty ? "未配置" : parts.joined(separator: " · ")
    }

    private func parseAppTaskContent(_ task: ArkTask?) -> [String: JSONPrimitive] {
        guard let content = task?.content,
              let data = content.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return [:]
        }
        return object.reduce(into: [String: JSONPrimitive]()) { result, pair in
            if let value = primitive(from: pair.value) {
                result[pair.key] = value
            }
        }
    }

    private func primitive(from value: Any) -> JSONPrimitive? {
        if let value = value as? String { return .string(value) }
        if let value = value as? Int { return .int(value) }
        if let value = value as? Double { return .double(value) }
        if let value = value as? Bool { return .bool(value) }
        return nil
    }

    private func configString(_ config: [String: JSONPrimitive], keys: [String]) -> String? {
        keys.lazy.compactMap { config[$0]?.stringValue }.first
    }

    private func configInt(_ config: [String: JSONPrimitive], keys: [String], fallback: Int) -> Int {
        keys.lazy.compactMap { config[$0]?.intValue }.first ?? fallback
    }

    private func configBool(_ config: [String: JSONPrimitive], keys: [String], fallback: Bool) -> Bool {
        keys.lazy.compactMap { config[$0]?.boolValue }.first ?? fallback
    }

    private func appOrder(_ type: String?) -> Int {
        appTypes.firstIndex(where: { $0.type == type }) ?? appTypes.count
    }

    private func appLabel(_ type: String?) -> String {
        appTypes.first(where: { $0.type == type })?.title ?? "应用"
    }

    private func appIcon(_ type: String?) -> String {
        switch type {
        case "vocab_today":
            return "text.book.closed"
        case "erc_practice":
            return "doc.text.magnifyingglass"
        case "erc_review":
            return "arrow.counterclockwise.circle"
        default:
            return "app.badge"
        }
    }
}

private struct EventColumnEmptyText: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .font(.callout)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, minHeight: 64, alignment: .center)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct EventInlineDeleteConfirmation: View {
    let title: String
    let message: String
    let confirmTitle: String
    let isSubmitting: Bool
    let onCancel: () -> Void
    let onConfirm: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: "exclamationmark.triangle.fill")
                .font(.headline)
                .foregroundStyle(.red)

            Text(message)
                .font(.callout)
                .foregroundStyle(.secondary)

            HStack(spacing: 10) {
                Button("取消", action: onCancel)
                    .buttonStyle(.bordered)
                    .disabled(isSubmitting)

                Button(role: .destructive, action: onConfirm) {
                    if isSubmitting {
                        ProgressView()
                    } else {
                        Text(confirmTitle)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(isSubmitting)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(.red.opacity(0.35), lineWidth: 1)
        )
    }
}

private struct EventMutationPayload: Encodable {
    let name: String
    let startDate: String
    let dueAt: Date
    let isPrimary: Bool?
}

private struct EventTaskPayload: Encodable {
    let title: String
    let content: String?
    let status: String
    let event: String
    let eventId: String
    let isRecurring: Bool
    let periodType: String
    let customPeriodDays: Int?
    let maxCompletionsPerPeriod: Int
    let weekdayOnly: Bool
    let timeInheritsFromEvent: Bool
    let timeOverridden: Bool
    let taskType: String
    let startDate: Date?
    let dueDate: Date?
}

private struct EventAppointmentPayload: Encodable {
    let title: String
    let content: String?
    let status: String
    let startsAt: Date?
    let endsAt: Date
    let repeatRule: String?
    let eventId: String
    let isRecurring: Bool
    let periodType: String
    let customPeriodDays: Int?
    let maxCompletionsPerPeriod: Int
    let weekdayOnly: Bool
    let timeInheritsFromEvent: Bool
    let timeOverridden: Bool
}

private struct EventWorkflowPayload: Encodable {
    let name: String
    let icon: String?
    let phases: [EventWorkflowPhasePayload]
    let focusDuration: Int
    let breakDuration: Int
    let defaultFocusTimerMode: String
    let isDefault: Bool
}

private struct EventWorkflowPhasePayload: Encodable {
    let phaseType: String
    let duration: Int
    let timerMode: String?
    let taskId: String?
    let focusWorkType: String?
}

private struct VocabAppTaskPayload: Encodable {
    let deckId: String
    let dailyTargetCount: Int
    let defaultFocusDuration: Int
    let addToTodayPlan: Bool
    let eventId: String
}

private func phaseDisplayTitle(_ phase: WorkflowPresetPhase) -> String {
    if phase.phaseType == "break" {
        return ""
    }
    switch phase.focusWorkType {
    case "vocab_today":
        return "今日单词"
    case "erc_practice":
        return "ERC 真题练习"
    case "erc_review":
        return "ERC 复习"
    default:
        return ""
    }
}

private func appConfigSummary(_ task: ArkTask) -> String {
    guard let content = task.content,
          let data = content.data(using: .utf8),
          let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        return "未配置"
    }

    var parts: [String] = []
    if let deckName = object["deckName"] as? String, !deckName.isEmpty {
        parts.append("词书 \(deckName)")
    }
    if let count = object["dailyTargetCount"] as? Int {
        parts.append("每日 \(count) 词")
    }
    if let count = object["dailyArticleTarget"] as? Int {
        parts.append("每日 \(count) 篇")
    }
    if let scope = object["reviewScope"] as? String {
        parts.append(scope == "due" ? "到期复习" : scope == "mistakes" ? "错题复习" : "全部")
    }
    if let count = object["dailyQuestionTarget"] as? Int {
        parts.append("每日 \(count) 题")
    }
    if let duration = object["defaultFocusDuration"] as? Int {
        parts.append("专注 \(max(1, duration / 60))m")
    }
    return parts.isEmpty ? "未配置" : parts.joined(separator: " · ")
}

private func normalizedText(_ value: String) -> String? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
}

private func eventCountdownDisplay(dueAt: Date, now: Date) -> String {
    let diff = abs(dueAt.timeIntervalSince(now))
    if diff <= 3_600 {
        let totalSeconds = max(0, Int(diff.rounded(.down)))
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return "\(minutes)m \(String(format: "%02ds", seconds))"
    }
    if diff <= 86_400 {
        let totalMinutes = max(0, Int((diff / 60).rounded(.down)))
        let hours = totalMinutes / 60
        let minutes = totalMinutes % 60
        return "\(hours)h \(String(format: "%02dm", minutes))"
    }
    let totalHours = max(0, Int((diff / 3_600).rounded(.down)))
    let days = totalHours / 24
    let hours = totalHours % 24
    return "\(days)d \(String(format: "%02dh", hours))"
}

private func eventCountdownColor(dueAt: Date, now: Date) -> Color {
    let diff = dueAt.timeIntervalSince(now)
    if abs(diff) <= 60 {
        return ArkTheme.warning
    }
    return diff > 0 ? ArkTheme.accent : .red
}

private func formatEventDateTime(_ date: Date) -> String {
    date.formatted(.dateTime.year().month(.twoDigits).day(.twoDigits).hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))
}

private func parseEventStartDate(_ value: String) -> Date? {
    EventDateFormatters.startDate.date(from: value)
}

private func formatEventStartDate(_ date: Date) -> String {
    EventDateFormatters.startDate.string(from: date)
}

private enum EventDateFormatters {
    static let startDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}

struct WebInspiredHomeScreen: View {
    @EnvironmentObject private var session: AppSession
    @State private var tasks: [ArkTask] = []
    @State private var appointments: [ArkAppointment] = []
    @State private var workflow: FocusWorkflow?
    @State private var workflowStartPresets: [WorkflowPreset] = []
    @State private var selectedWorkflowStartId: String?
    @State private var isWorkflowStartPresented = false
    @State private var todayFocusMinutes = 0
    @State private var isDashboardActionRunning = false
    @State private var isTaskPickerPresented = false
    @State private var errorMessage: String?
    @State private var timerNow = Date()

    private let liveTimer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    private let dashboardRefreshTimer = Timer.publish(every: 10, on: .main, in: .common).autoconnect()

    let onNavigate: (AppSection) -> Void

    var body: some View {
        GeometryReader { proxy in
            let dashboardWidth = min(max(proxy.size.width * 0.39, 470), 560)
            let stageWidth = max(proxy.size.width - dashboardWidth - 14, 0)

            HStack(spacing: 14) {
                CharacterStageCard()
                    .frame(width: stageWidth, height: proxy.size.height)

            HomeGlassDashboard(
                tasks: tasks,
                appointments: appointments,
                workflow: workflow,
                workflowPresets: workflowStartPresets,
                now: timerNow,
                todayFocusMinutes: todayFocusMinutes,
                isActionRunning: isDashboardActionRunning,
                errorMessage: errorMessage,
                    onRefresh: { Task { await load() } },
                    onPrimaryFocusAction: { Task { await runPrimaryFocusAction() } },
                    onCompleteTask: { task in Task { await completeTask(task) } },
                    onCompleteAppointment: { appointment in Task { await completeAppointment(appointment) } },
                    onNavigate: onNavigate
                )
                .frame(width: dashboardWidth, height: proxy.size.height)
            }
            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .leading)
        }
        .task {
            await load()
        }
        .onReceive(NotificationCenter.default.publisher(for: .arkFocusWorkflowDidChange)) { _ in
            Task { await load() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .arkScheduleDidChange)) { _ in
            Task { await load() }
        }
        .onReceive(liveTimer) { value in
            timerNow = value
        }
        .onReceive(dashboardRefreshTimer) { _ in
            guard !isWorkflowStartPresented, !isTaskPickerPresented, !isDashboardActionRunning else { return }
            Task { await load() }
        }
        .sheet(isPresented: $isTaskPickerPresented) {
            FocusTaskPickerSheet(
                tasks: tasks.filter { !$0.isDone },
                isSelecting: isDashboardActionRunning,
                onCancel: { isTaskPickerPresented = false },
                onSelect: { task in Task { await selectFocusTask(task) } }
            )
        }
        .sheet(isPresented: $isWorkflowStartPresented) {
            WorkflowStartSheet(
                presets: workflowStartPresets,
                selectedPresetId: $selectedWorkflowStartId,
                tasks: tasks,
                isSubmitting: isDashboardActionRunning,
                onCancel: { isWorkflowStartPresented = false },
                onStart: { preset in Task { await startWorkflow(preset) } },
                onSetDefault: { preset in Task { await setDefaultWorkflow(preset) } }
            )
        }
    }

    private func load() async {
        guard let token = session.token else { return }
        errorMessage = nil
        do {
            async let tasksResponse: [ArkTask] = session.api.get("/todo/tasks?limit=100", token: token)
            async let appointmentsResponse: [ArkAppointment] = session.api.get("/todo/appointments", token: token)
            async let workflowResponse: FocusWorkflow = session.api.get("/todo/focus/workflow/current", token: token)
            async let focusResponse: TodayFocusSummary = session.api.get("/todo/focus/today", token: token)
            async let presetsResponse: [WorkflowPreset] = session.api.get("/todo/focus/workflows", token: token)

            tasks = try await tasksResponse
            appointments = try await appointmentsResponse
            workflow = try? await workflowResponse
            todayFocusMinutes = (try? await focusResponse)?.minutes ?? 0
            workflowStartPresets = (try? await presetsResponse) ?? workflowStartPresets
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func runPrimaryFocusAction() async {
        guard let token = session.token else { return }
        isDashboardActionRunning = true
        errorMessage = nil
        defer { isDashboardActionRunning = false }

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
                let presets: [WorkflowPreset] = try await session.api.get("/todo/focus/workflows", token: token)
                guard let preset = presets.first(where: { $0.isDefault == true }) ?? presets.first else {
                    errorMessage = "还没有可启动的工作流"
                    return
                }
                workflowStartPresets = presets
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
        isDashboardActionRunning = true
        errorMessage = nil
        defer { isDashboardActionRunning = false }

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
        isDashboardActionRunning = true
        errorMessage = nil
        defer { isDashboardActionRunning = false }

        do {
            let _: WorkflowPreset = try await session.api.post("/todo/focus/workflows/\(preset.id)/default", token: token)
            workflowStartPresets = try await session.api.get("/todo/focus/workflows", token: token)
            selectedWorkflowStartId = preset.id
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func completeTask(_ task: ArkTask) async {
        guard let token = session.token else { return }
        isDashboardActionRunning = true
        errorMessage = nil
        defer { isDashboardActionRunning = false }

        do {
            let _: ArkTask = try await session.api.post("/todo/tasks/\(task.id)/complete", token: token)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func completeAppointment(_ appointment: ArkAppointment) async {
        guard let token = session.token else { return }
        isDashboardActionRunning = true
        errorMessage = nil
        defer { isDashboardActionRunning = false }

        do {
            let _: ArkAppointment = try await session.api.post("/todo/appointments/\(appointment.id)/complete", token: token)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func selectFocusTask(_ task: ArkTask) async {
        guard let token = session.token else { return }
        isDashboardActionRunning = true
        errorMessage = nil
        defer { isDashboardActionRunning = false }

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

struct WorkflowStartSheet: View {
    let presets: [WorkflowPreset]
    @Binding var selectedPresetId: String?
    let tasks: [ArkTask]
    let isSubmitting: Bool
    let onCancel: () -> Void
    let onStart: (WorkflowPreset) -> Void
    let onSetDefault: (WorkflowPreset) -> Void

    private var selectedPreset: WorkflowPreset? {
        presets.first { $0.id == selectedPresetId } ?? presets.first
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("开始学习")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(ArkHomeStyle.text)
                    Text("本次将启动选中的工作流")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(ArkHomeStyle.muted)
                }
                Spacer()
                Button(action: onCancel) {
                    Image(systemName: "xmark")
                        .font(.headline.weight(.bold))
                        .frame(width: 38, height: 38)
                        .background(.ultraThinMaterial, in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(isSubmitting)
                .accessibilityLabel("关闭开始学习提示")
            }
            .padding(.horizontal, 22)
            .frame(height: 72)
            .background(.regularMaterial)

            HStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("可选工作流")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(ArkHomeStyle.faint)
                            .padding(.bottom, 2)

                        ForEach(presets) { preset in
                            WorkflowPresetRow(
                                preset: preset,
                                selected: preset.id == selectedPreset?.id,
                                isSubmitting: isSubmitting,
                                onSelect: { selectedPresetId = preset.id },
                                onSetDefault: { onSetDefault(preset) }
                            )
                        }
                    }
                    .padding(18)
                }
                .frame(width: 270)
                .background(Color.white.opacity(0.18))

                Divider()

                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        Text("本次工作流")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(ArkHomeStyle.faint)

                        Text(selectedPreset?.name ?? "未选择工作流")
                            .font(.system(size: 30, weight: .heavy, design: .rounded))
                            .foregroundStyle(ArkHomeStyle.text)

                        Text(workflowSummary(selectedPreset))
                            .font(.callout.weight(.medium))
                            .foregroundStyle(ArkHomeStyle.muted)

                        WorkflowPhaseChain(phases: selectedPreset?.phases ?? [], tasks: tasks)
                            .padding(18)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .stroke(.white.opacity(0.55), lineWidth: 1)
                            }
                    }
                    .padding(22)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            HStack(spacing: 12) {
                Spacer()
                Button("取消", action: onCancel)
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .disabled(isSubmitting)

                Button {
                    if let selectedPreset {
                        onStart(selectedPreset)
                    }
                } label: {
                    Label("开始本次工作流", systemImage: "play.fill")
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(isSubmitting || selectedPreset == nil)
            }
            .padding(18)
            .background(.regularMaterial)
        }
        .frame(minWidth: 760, idealWidth: 820, minHeight: 520, idealHeight: 600)
        .presentationDetents([.large])
        .presentationCornerRadius(26)
    }
}

private struct WorkflowPresetRow: View {
    let preset: WorkflowPreset
    let selected: Bool
    let isSubmitting: Bool
    let onSelect: () -> Void
    let onSetDefault: () -> Void

    var body: some View {
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Text(preset.name)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(selected ? ArkHomeStyle.text : ArkHomeStyle.muted)
                        .lineLimit(1)
                    Spacer()
                    if preset.isDefault == true {
                        Text("默认")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(ArkHomeStyle.muted)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(.ultraThinMaterial, in: Capsule())
                    } else {
                        Button("设为默认", action: onSetDefault)
                            .font(.caption2.weight(.bold))
                            .buttonStyle(.bordered)
                            .controlSize(.mini)
                            .disabled(isSubmitting)
                    }
                }
                Text(workflowSummary(preset))
                    .font(.caption.weight(.medium))
                    .foregroundStyle(ArkHomeStyle.faint)
                    .lineLimit(1)
            }
            .padding(13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(selected ? Color.white.opacity(0.58) : Color.white.opacity(0.24), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(selected ? ArkHomeStyle.accent.opacity(0.45) : Color.white.opacity(0.45), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .disabled(isSubmitting)
    }
}

private struct WorkflowPhaseChain: View {
    let phases: [WorkflowPresetPhase]
    let tasks: [ArkTask]

    var body: some View {
        if phases.isEmpty {
            Text("暂无阶段配置")
                .font(.callout)
                .foregroundStyle(ArkHomeStyle.muted)
        } else {
            FlowLayout(spacing: 8, rowSpacing: 10) {
                ForEach(Array(phases.enumerated()), id: \.offset) { index, phase in
                    WorkflowPhaseChip(phase: phase, title: phaseTitle(phase, tasks: tasks))
                    if index < phases.count - 1 {
                        Text("→")
                            .font(.headline.weight(.bold))
                            .foregroundStyle(ArkHomeStyle.faint)
                    }
                }
            }
        }
    }
}

private struct WorkflowPhaseChip: View {
    let phase: WorkflowPresetPhase
    let title: String

    private var isFocus: Bool {
        phase.phaseType == "focus"
    }

    var body: some View {
        HStack(spacing: 6) {
            Text(isFocus ? "🎯" : "☕")
            Text(formatDurationMinutes(phase.duration))
                .font(.caption.weight(.bold))
            if isFocus {
                Text("|")
                    .foregroundStyle(ArkHomeStyle.faint)
                Text(title)
                    .font(.caption.weight(.bold))
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .foregroundStyle(isFocus ? ArkHomeStyle.text : ArkHomeStyle.muted)
        .background((isFocus ? ArkHomeStyle.accent : ArkTheme.warning).opacity(0.12), in: Capsule())
        .overlay {
            Capsule()
                .stroke(Color.white.opacity(0.5), lineWidth: 1)
        }
    }
}

private struct FlowLayout: Layout {
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

private func workflowSummary(_ preset: WorkflowPreset?) -> String {
    guard let phases = preset?.phases, !phases.isEmpty else {
        return "0 个阶段 · 专注 0 分钟 · 休息 0 分钟"
    }
    let focusSeconds = phases.filter { $0.phaseType == "focus" }.reduce(0) { $0 + $1.duration }
    let breakSeconds = phases.filter { $0.phaseType == "break" }.reduce(0) { $0 + $1.duration }
    return "\(phases.count) 个阶段 · 专注 \(focusSeconds / 60) 分钟 · 休息 \(breakSeconds / 60) 分钟"
}

private func phaseTitle(_ phase: WorkflowPresetPhase, tasks: [ArkTask]) -> String {
    if let taskId = phase.taskId,
       let task = tasks.first(where: { $0.id == taskId }) {
        return task.title
    }

    switch phase.focusWorkType {
    case "vocab_today":
        return "今日单词"
    case "erc_practice":
        return "ERC 真题练习"
    case "erc_review":
        return "ERC 复习"
    case "task_focus":
        return "任务专注"
    default:
        return phase.phaseType == "focus" ? "任务专注" : "休息"
    }
}

private func formatDurationMinutes(_ seconds: Int) -> String {
    "\(max(0, seconds) / 60)m"
}

private struct CharacterStageCard: View {
    var body: some View {
        GeometryReader { proxy in
            ZStack {
                BundledRasterImage(name: "background", extensionName: "jpg")
                    .scaledToFill()
                    .scaleEffect(1.03)
                    .opacity(0.58)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)

                Rectangle()
                    .fill(
                        LinearGradient(
                            colors: [.white.opacity(0.30), .white.opacity(0.03), .white.opacity(0.20)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)

                BundledRasterImage(name: "chara", extensionName: "png")
                    .scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .scaleEffect(1.30)
                    .offset(x: -58, y: -8)
                    .shadow(color: .black.opacity(0.16), radius: 24, x: 0, y: 16)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)

                DialogueCard(stageSize: proxy.size)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.62), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.10), radius: 24, x: 0, y: 14)
    }
}

private struct DialogueCard: View {
    let stageSize: CGSize

    var body: some View {
        let cardHeight = min(max(stageSize.height * 0.43, 220), 250)
        let cardWidth = max(stageSize.width - 56, 280)

        VStack(alignment: .leading, spacing: 15) {
            HStack(spacing: 7) {
                Image(systemName: "sparkles")
                    .font(.caption.weight(.bold))
                Text("莫宁")
                    .font(.subheadline.weight(.bold))
            }
            .foregroundStyle(ArkHomeStyle.text)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(.ultraThinMaterial, in: Capsule())

            Text("你好！我是莫宁。你可以从右侧的快捷选项中选择回复，或者直接在下方输入你的问题。")
                .font(.caption.weight(.medium))
                .foregroundStyle(ArkHomeStyle.text)
                .lineSpacing(3)
                .lineLimit(2)

            HStack(spacing: 8) {
                DialogueChip(symbol: "questionmark.circle", title: "给我介绍一下这个系统")
                DialogueChip(symbol: "questionmark.bubble", title: "你是谁？")
                DialogueChip(symbol: "square.and.pencil", title: "如何开始使用？")
            }
            .frame(maxWidth: .infinity)

            HStack(spacing: 10) {
                Text("输入你的问题...")
                    .font(.caption)
                    .foregroundStyle(ArkHomeStyle.faint)
                Spacer()
                Image(systemName: "paperplane.fill")
                    .font(.subheadline)
                    .foregroundStyle(.white)
                    .frame(width: 38, height: 38)
                    .background(ArkHomeStyle.accent, in: Circle())
            }
            .padding(.leading, 16)
            .padding(.trailing, 6)
            .frame(height: 50)
            .background(.ultraThinMaterial, in: Capsule())
        }
        .padding(18)
        .frame(width: cardWidth, height: cardHeight, alignment: .topLeading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(.white.opacity(0.62), lineWidth: 1)
        }
        .position(x: stageSize.width / 2, y: stageSize.height - 28 - cardHeight / 2)
    }
}

private struct DialogueChip: View {
    let symbol: String
    let title: String

    var body: some View {
        Label(title, systemImage: symbol)
            .font(.caption.weight(.semibold))
            .lineLimit(1)
            .minimumScaleFactor(0.68)
            .padding(.horizontal, 8)
            .frame(height: 34)
            .frame(maxWidth: .infinity)
            .background(.ultraThinMaterial, in: Capsule())
            .foregroundStyle(ArkHomeStyle.muted)
    }
}

private struct BundledRasterImage: View {
    let name: String
    let extensionName: String

    var body: some View {
        if let url = Bundle.main.url(forResource: name, withExtension: extensionName),
           let image = UIImage(contentsOfFile: url.path) {
            Image(uiImage: image)
                .resizable()
        } else {
            Rectangle()
                .fill(.gray.opacity(0.18))
                .overlay {
                    Image(systemName: "photo")
                        .foregroundStyle(.secondary)
                }
        }
    }
}

private struct HomeGlassDashboard: View {
    let tasks: [ArkTask]
    let appointments: [ArkAppointment]
    let workflow: FocusWorkflow?
    let workflowPresets: [WorkflowPreset]
    let now: Date
    let todayFocusMinutes: Int
    let isActionRunning: Bool
    let errorMessage: String?
    let onRefresh: () -> Void
    let onPrimaryFocusAction: () -> Void
    let onCompleteTask: (ArkTask) -> Void
    let onCompleteAppointment: (ArkAppointment) -> Void
    let onNavigate: (AppSection) -> Void

    private var visibleTasks: [ArkTask] {
        Array(tasks.filter { !$0.isDone }.prefix(3))
    }

    private var upcomingAppointments: [ArkAppointment] {
        Array(appointments.prefix(3))
    }

    var body: some View {
        VStack(spacing: 10) {
            TimerHeroCard(
                workflow: workflow,
                workflowPresets: workflowPresets,
                now: now,
                isBusy: isActionRunning,
                onPrimaryAction: onPrimaryFocusAction
            )
                .frame(maxHeight: .infinity)

            ProgressCard(minutes: todayFocusMinutes)
                .frame(height: 112)

            TaskScheduleCard(
                tasks: visibleTasks,
                appointments: upcomingAppointments,
                isBusy: isActionRunning,
                onCompleteTask: onCompleteTask,
                onCompleteAppointment: onCompleteAppointment,
                onArrange: { onNavigate(.tasks) }
            )
                .frame(maxHeight: .infinity)

            CalendarPreviewCard()
                .frame(maxHeight: .infinity)

            HStack(spacing: 10) {
                ShortcutCard(symbol: "chart.bar.xaxis", title: "数据分析", subtitle: "学习数据可视化") { onRefresh() }
                ShortcutCard(symbol: "trophy", title: "成就", subtitle: "解锁成长里程碑") { onRefresh() }
                ShortcutCard(symbol: "shippingbox", title: "应用中心", subtitle: "更多学习工具") { onNavigate(.apps) }
            }
            .frame(height: 104)

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .lineLimit(1)
            }
        }
    }
}

private struct TimerHeroCard: View {
    let workflow: FocusWorkflow?
    let workflowPresets: [WorkflowPreset]
    let now: Date
    let isBusy: Bool
    let onPrimaryAction: () -> Void

    private var timerText: String {
        formatTimer(workflow?.liveTimerSeconds(now: now) ?? 0)
    }

    private var phaseLabel: String {
        workflow?.state == "break" ? "休息阶段" : "当前阶段"
    }

    private var workflowName: String {
        workflow?.workflowName
        ?? workflowPresets.first(where: { $0.isDefault == true })?.name
        ?? workflowPresets.first?.name
        ?? "默认工作流"
    }

    private var actionTitle: String {
        if workflow?.pendingTaskSelection == true { return "选择任务" }
        if workflow?.state == "break" { return "结束休息" }
        if workflow?.pendingConfirmation == true { return "确认流转" }
        if workflow?.state == "focus" { return "结束阶段" }
        return "开始学习"
    }

    var body: some View {
        HomeCardSurface {
            ZStack {
                TimerArtwork()

                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 13) {
                        HStack(spacing: 8) {
                            Circle()
                                .fill(ArkHomeStyle.accent)
                                .frame(width: 9, height: 9)
                            Text(phaseLabel)
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(ArkHomeStyle.text)
                        }

                        Text(timerText)
                            .font(.system(size: 56, weight: .heavy, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Color(red: 0.04, green: 0.13, blue: 0.32))
                            .minimumScaleFactor(0.72)

                        Text("当前工作流：\(workflowName)")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(ArkHomeStyle.muted)
                    }

                    Spacer()

                    Button(action: onPrimaryAction) {
                        HStack(spacing: 10) {
                            if isBusy {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                Image(systemName: "play.circle.fill")
                                    .font(.title2)
                            }
                            Text(actionTitle)
                                .font(.headline.weight(.bold))
                        }
                        .foregroundStyle(.white)
                        .frame(width: 168, height: 54)
                        .background(
                            LinearGradient(
                                colors: [Color(red: 0.38, green: 0.58, blue: 0.96), Color(red: 0.12, green: 0.31, blue: 0.82)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            in: RoundedRectangle(cornerRadius: 22, style: .continuous)
                        )
                        .shadow(color: ArkHomeStyle.accent.opacity(0.32), radius: 14, x: 0, y: 8)
                    }
                    .buttonStyle(.plain)
                    .disabled(isBusy)
                }
                .padding(22)
            }
        }
    }
}

private struct TimerArtwork: View {
    var body: some View {
        ZStack(alignment: .topTrailing) {
            Circle()
                .stroke(ArkHomeStyle.accent.opacity(0.10), lineWidth: 22)
                .frame(width: 174, height: 174)
                .offset(x: 44, y: -34)

            Path { path in
                path.move(to: CGPoint(x: -20, y: 142))
                path.addCurve(to: CGPoint(x: 230, y: 118), control1: CGPoint(x: 70, y: 90), control2: CGPoint(x: 132, y: 170))
                path.addCurve(to: CGPoint(x: 510, y: 86), control1: CGPoint(x: 340, y: 56), control2: CGPoint(x: 392, y: 150))
            }
            .stroke(ArkHomeStyle.accent.opacity(0.12), lineWidth: 2)
        }
        .clipped()
    }
}

private struct ProgressCard: View {
    let minutes: Int

    private var percent: Int {
        min(100, Int((Double(minutes) / 120.0 * 100).rounded()))
    }

    private var visualPercent: Double {
        max(Double(percent), 4)
    }

    var body: some View {
        HomeCardSurface {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    HStack(spacing: 8) {
                        Image(systemName: "circle.dashed")
                            .font(.headline)
                            .foregroundStyle(ArkHomeStyle.accent)
                        Text("今日进度")
                            .font(.headline.weight(.bold))
                            .foregroundStyle(ArkHomeStyle.text)
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(percent)%")
                            .font(.system(size: 30, weight: .heavy, design: .rounded))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [Color(red: 0.38, green: 0.63, blue: 0.98), Color(red: 0.25, green: 0.79, blue: 0.68)],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                        Text("整体进度")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(ArkHomeStyle.faint)
                    }
                }

                VStack(spacing: 8) {
                    GeometryReader { proxy in
                        Capsule()
                            .fill(Color(red: 0.85, green: 0.89, blue: 0.96))
                            .overlay(alignment: .leading) {
                                Capsule()
                                    .fill(ArkHomeStyle.accent)
                                    .frame(width: proxy.size.width * visualPercent / 100.0)
                            }
                    }
                    .frame(height: 8)

                    HStack {
                        Text("已完成 \(minutes) 分钟 / 120 分钟")
                        Spacer()
                        Text("目标已达成 \(percent)%")
                    }
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(ArkHomeStyle.faint)
                }
            }
            .padding(18)
        }
    }
}

private struct TaskScheduleCard: View {
    let tasks: [ArkTask]
    let appointments: [ArkAppointment]
    let isBusy: Bool
    let onCompleteTask: (ArkTask) -> Void
    let onCompleteAppointment: (ArkAppointment) -> Void
    let onArrange: () -> Void

    var body: some View {
        HomeCardSurface {
            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    Button("安排", action: onArrange)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(ArkHomeStyle.accent)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(.ultraThinMaterial, in: Capsule())
                }
                .frame(height: 30)

                HStack(spacing: 18) {
                    VStack(alignment: .leading, spacing: 12) {
                        SectionLabel(title: "任务")
                        if tasks.isEmpty {
                            EmptyMiniRow(symbol: "checklist", title: "今日暂无任务", subtitle: "点击右上角添加今日计划")
                        } else {
                            ForEach(tasks) { task in
                                TaskMiniRow(task: task, isBusy: isBusy, onComplete: { onCompleteTask(task) })
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

                    Rectangle()
                        .fill(ArkHomeStyle.faint.opacity(0.18))
                        .frame(width: 1)

                    VStack(alignment: .leading, spacing: 12) {
                        SectionLabel(title: "日程")
                        if appointments.isEmpty {
                            EmptyMiniRow(symbol: "calendar", title: "暂无近期日程", subtitle: "点击右上角安排日程")
                        } else {
                            ForEach(Array(appointments.enumerated()), id: \.element.id) { index, item in
                                AppointmentMiniRow(
                                    appointment: item,
                                    isLast: index == appointments.count - 1,
                                    isBusy: isBusy,
                                    onComplete: { onCompleteAppointment(item) }
                                )
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 16)
            }
        }
    }
}

private struct CalendarPreviewCard: View {
    private let calendar = Calendar.current
    private let weekdays = ["日", "一", "二", "三", "四", "五", "六"]

    private var monthTitle: String {
        let components = calendar.dateComponents([.year, .month], from: .now)
        return "\(components.year ?? 2026) 年 \(components.month ?? 6) 月"
    }

    private var days: [Int?] {
        let now = Date.now
        guard let monthInterval = calendar.dateInterval(of: .month, for: now),
              let range = calendar.range(of: .day, in: .month, for: now) else {
            return []
        }
        let firstWeekday = calendar.component(.weekday, from: monthInterval.start)
        let leading = Array<Int?>(repeating: nil, count: max(firstWeekday - 1, 0))
        return leading + range.map { Optional($0) }
    }

    var body: some View {
        HomeCardSurface {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label("日历", systemImage: "calendar")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(ArkHomeStyle.text)
                    Spacer()
                    Text(monthTitle)
                        .font(.headline.weight(.heavy))
                        .foregroundStyle(ArkHomeStyle.text)
                    Spacer()
                    HStack(spacing: 8) {
                        Image(systemName: "chevron.left")
                        Image(systemName: "chevron.right")
                    }
                    .font(.caption.weight(.bold))
                    .foregroundStyle(ArkHomeStyle.faint)
                }

                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 6) {
                    ForEach(weekdays, id: \.self) { weekday in
                        Text(weekday)
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(ArkHomeStyle.faint)
                    }

                    ForEach(Array(days.prefix(35).enumerated()), id: \.offset) { _, day in
                        CalendarDayCell(day: day)
                    }
                }
            }
            .padding(18)
        }
    }
}

private struct CalendarDayCell: View {
    let day: Int?

    private var isToday: Bool {
        day == Calendar.current.component(.day, from: .now)
    }

    var body: some View {
        Text(day.map(String.init) ?? "")
            .font(.caption.weight(isToday ? .heavy : .medium))
            .foregroundStyle(isToday ? ArkHomeStyle.accent : ArkHomeStyle.muted)
            .frame(height: 18)
            .frame(maxWidth: .infinity)
            .background {
                if isToday {
                    Circle()
                        .fill(ArkHomeStyle.accent.opacity(0.12))
                        .frame(width: 24, height: 24)
                }
            }
    }
}

private struct ShortcutCard: View {
    let symbol: String
    let title: String
    let subtitle: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HomeCardSurface {
                VStack(alignment: .leading, spacing: 6) {
                    Image(systemName: symbol)
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(ArkHomeStyle.accent)
                        .frame(width: 42, height: 42)
                        .background(ArkHomeStyle.accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    Spacer(minLength: 0)
                    Text(title)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(ArkHomeStyle.text)
                        .lineLimit(1)
                    Text(subtitle)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(ArkHomeStyle.faint)
                        .lineLimit(1)
                }
                .padding(14)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            }
        }
        .buttonStyle(.plain)
    }
}

private struct HomeCardSurface<Content: View>: View {
    @ViewBuilder var content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(.white.opacity(0.54), lineWidth: 1)
            }
            .shadow(color: .black.opacity(0.05), radius: 16, x: 0, y: 8)
    }
}

private struct SectionLabel: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.subheadline.weight(.heavy))
            .foregroundStyle(ArkHomeStyle.text)
    }
}

private struct TaskMiniRow: View {
    let task: ArkTask
    let isBusy: Bool
    let onComplete: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Button(action: onComplete) {
                Image(systemName: "circle")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(ArkHomeStyle.faint.opacity(0.65))
                    .frame(width: 20, height: 20)
            }
            .buttonStyle(.plain)
            .disabled(isBusy)
            .accessibilityLabel("完成任务 \(task.title)")

            Text(task.title)
                .font(.caption.weight(.bold))
                .foregroundStyle(ArkHomeStyle.text)
                .lineLimit(1)
            Spacer()
            Text(task.dueDate == nil ? "未安排" : formatClock(task.dueDate))
                .font(.caption.weight(.medium))
                .foregroundStyle(ArkHomeStyle.muted)
                .lineLimit(1)
        }
        .frame(height: 26)
    }
}

private struct AppointmentMiniRow: View {
    let appointment: ArkAppointment
    let isLast: Bool
    let isBusy: Bool
    let onComplete: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Text(formatClock(appointment.startsAt ?? appointment.endsAt))
                .font(.caption.weight(.bold))
                .foregroundStyle(ArkHomeStyle.text)
                .frame(width: 40, alignment: .leading)

            Button(action: onComplete) {
                ZStack(alignment: .top) {
                    if !isLast {
                        Rectangle()
                            .fill(ArkHomeStyle.faint.opacity(0.25))
                            .frame(width: 1, height: 28)
                            .offset(y: 10)
                    }
                    Circle()
                        .fill(ArkHomeStyle.accent)
                        .frame(width: 8, height: 8)
                }
                .frame(width: 12, height: 28)
            }
            .buttonStyle(.plain)
            .disabled(isBusy)
            .accessibilityLabel("完成日程 \(appointment.title)")

            Text(appointment.title)
                .font(.caption.weight(.bold))
                .foregroundStyle(ArkHomeStyle.muted)
                .lineLimit(1)
        }
        .frame(height: 28)
    }
}

private struct EmptyMiniRow: View {
    let symbol: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: symbol)
                .font(.headline)
                .foregroundStyle(ArkHomeStyle.accent)
                .frame(width: 36, height: 36)
                .background(ArkHomeStyle.accent.opacity(0.08), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(ArkHomeStyle.text)
                    .lineLimit(1)
                Text(subtitle)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(ArkHomeStyle.faint)
                    .lineLimit(1)
            }
        }
        .padding(10)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private func formatTimer(_ seconds: Int) -> String {
    let safeSeconds = max(0, seconds)
    let minutes = safeSeconds / 60
    let restSeconds = safeSeconds % 60
    return String(format: "%02d:%02d", minutes, restSeconds)
}

private func formatClock(_ value: Date?) -> String {
    guard let value else { return "未安排" }
    return value.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))
}
