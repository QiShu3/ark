import SwiftUI

struct HomeDashboardScreen: View {
    @EnvironmentObject private var session: AppSession
    @State private var tasks: [ArkTask] = []
    @State private var appointments: [ArkAppointment] = []
    @State private var workflow: FocusWorkflow?
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ArkTheme.sectionSpacing) {
                header

                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 16), count: 3), spacing: 16) {
                    MetricTile(title: "今日任务", value: "\(tasks.filter { !$0.isDone }.count)", symbol: "checklist")
                    MetricTile(title: "今日安排", value: "\(appointments.count)", symbol: "calendar.badge.clock", tint: ArkTheme.warning)
                    MetricTile(title: "当前状态", value: workflow?.stateDisplay ?? "待开始", symbol: "timer", tint: ArkTheme.success)
                }

                HStack(alignment: .top, spacing: 18) {
                    todayTasksCard
                    rightColumn
                }
            }
            .padding(28)
        }
        .navigationTitle("首页")
        .arkScreenBackground()
        .toolbar {
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
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("你好，\(session.user?.username ?? "Ark")")
                .font(.largeTitle.bold())
            Text("iPad 版先聚焦今日行动和专注推进，后续再补完整编辑器。")
                .font(.title3)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var todayTasksCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("今日任务", systemImage: "checklist")
                .font(.title3.bold())

            if isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 180)
            } else if let errorMessage {
                ContentUnavailableView("加载失败", systemImage: "exclamationmark.triangle", description: Text(errorMessage))
            } else if tasks.isEmpty {
                ContentUnavailableView("暂无任务", systemImage: "sparkles", description: Text("现有后端返回空列表。"))
            } else {
                VStack(spacing: 10) {
                    ForEach(tasks.prefix(8)) { task in
                        HStack(spacing: 12) {
                            Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(task.isDone ? ArkTheme.success : .secondary)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(task.title)
                                    .font(.headline)
                                if !task.event.isEmpty {
                                    Text(task.event)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                        }
                        .padding(12)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .arkCard()
    }

    private var rightColumn: some View {
        VStack(spacing: 18) {
            VStack(alignment: .leading, spacing: 12) {
                Label("专注工作流", systemImage: "timer")
                    .font(.title3.bold())
                Text(workflow?.summary ?? "当前没有运行中的工作流。")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .arkCard()

            VStack(alignment: .leading, spacing: 12) {
                Label("今日安排", systemImage: "calendar")
                    .font(.title3.bold())
                ForEach(appointments.prefix(4)) { appointment in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(appointment.title)
                            .font(.headline)
                        Text(appointment.endsAt.formatted(date: .omitted, time: .shortened))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                if appointments.isEmpty {
                    Text("暂无安排")
                        .foregroundStyle(.secondary)
                }
            }
            .arkCard()
        }
        .frame(width: 360)
    }

    private func load() async {
        guard let token = session.token else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            async let tasksResponse: [ArkTask] = session.api.get("/todo/tasks?limit=100", token: token)
            async let appointmentsResponse: [ArkAppointment] = session.api.get("/todo/appointments?view=today", token: token)
            async let workflowResponse: FocusWorkflow = session.api.get("/todo/focus/workflow/current", token: token)
            tasks = try await tasksResponse
            appointments = try await appointmentsResponse
            workflow = try? await workflowResponse
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
