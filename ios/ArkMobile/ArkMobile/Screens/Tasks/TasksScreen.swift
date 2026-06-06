import SwiftUI

struct TasksScreen: View {
    @EnvironmentObject private var session: AppSession
    @State private var tasks: [ArkTask] = []
    @State private var appointments: [ArkAppointment] = []
    @State private var selectedKind: ArrangementKind = .tasks
    @State private var isLoading = false
    @State private var actionInFlightId: String?
    @State private var errorMessage: String?

    private var openTasks: [ArkTask] {
        tasks.filter { !$0.isDone }
    }

    private var completedTasks: [ArkTask] {
        tasks.filter(\.isDone)
    }

    private var openAppointments: [ArkAppointment] {
        appointments.filter { !["attended", "cancelled", "missed"].contains($0.status) }
    }

    var body: some View {
        HStack(spacing: 18) {
            ArrangementSummaryPane(
                openTasks: openTasks,
                completedTasks: completedTasks,
                appointments: openAppointments,
                selectedKind: $selectedKind,
                onRefresh: { Task { await load() } }
            )
            .frame(width: 320)

            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(selectedKind.title)
                            .font(.largeTitle.weight(.heavy))
                        Text(selectedKind == .tasks ? "按 Web 端安排管理的任务列表处理。" : "显示近期日程，可直接确认完成。")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Picker("安排类型", selection: $selectedKind) {
                        ForEach(ArrangementKind.allCases) { kind in
                            Label(kind.title, systemImage: kind.symbol)
                                .tag(kind)
                        }
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 260)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.callout)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .arkCard()
                }

                Group {
                    if selectedKind == .tasks {
                        ArrangementTaskList(
                            tasks: openTasks,
                            completedTasks: completedTasks,
                            actionInFlightId: actionInFlightId,
                            onComplete: { task in Task { await completeTask(task) } }
                        )
                    } else {
                        ArrangementAppointmentList(
                            appointments: openAppointments,
                            actionInFlightId: actionInFlightId,
                            onComplete: { appointment in Task { await completeAppointment(appointment) } }
                        )
                    }
                }
                .overlay {
                    if isLoading {
                        ProgressView()
                            .padding(28)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .arkCard()
        }
        .padding(24)
        .navigationTitle("今日安排")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    Task { await load() }
                } label: {
                    Label("刷新", systemImage: "arrow.clockwise")
                }
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
            async let tasksResponse: [ArkTask] = session.api.get("/todo/tasks?limit=100", token: token)
            async let appointmentsResponse: [ArkAppointment] = session.api.get("/todo/appointments", token: token)
            tasks = try await tasksResponse
            appointments = try await appointmentsResponse
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func completeTask(_ task: ArkTask) async {
        guard let token = session.token else { return }
        actionInFlightId = task.id
        errorMessage = nil
        defer { actionInFlightId = nil }

        do {
            let _: ArkTask = try await session.api.post("/todo/tasks/\(task.id)/complete", token: token)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func completeAppointment(_ appointment: ArkAppointment) async {
        guard let token = session.token else { return }
        actionInFlightId = appointment.id
        errorMessage = nil
        defer { actionInFlightId = nil }

        do {
            let _: ArkAppointment = try await session.api.post("/todo/appointments/\(appointment.id)/complete", token: token)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private enum ArrangementKind: String, CaseIterable, Identifiable {
    case tasks
    case appointments

    var id: String { rawValue }

    var title: String {
        switch self {
        case .tasks: "任务"
        case .appointments: "日程"
        }
    }

    var symbol: String {
        switch self {
        case .tasks: "checklist"
        case .appointments: "calendar"
        }
    }
}

private struct ArrangementSummaryPane: View {
    let openTasks: [ArkTask]
    let completedTasks: [ArkTask]
    let appointments: [ArkAppointment]
    @Binding var selectedKind: ArrangementKind
    let onRefresh: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("安排管理")
                        .font(.title2.weight(.heavy))
                    Text("安排总览")
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button(action: onRefresh) {
                    Image(systemName: "arrow.clockwise")
                        .font(.headline)
                        .frame(width: 38, height: 38)
                }
                .buttonStyle(.plain)
                .background(.thinMaterial, in: Circle())
            }

            VStack(spacing: 12) {
                SummaryMetric(title: "待完成任务", value: "\(openTasks.count)", symbol: "checklist", tint: ArkTheme.accent)
                SummaryMetric(title: "今日日程", value: "\(appointments.count)", symbol: "calendar", tint: ArkTheme.warning)
                SummaryMetric(title: "已完成", value: "\(completedTasks.count)", symbol: "checkmark.seal", tint: ArkTheme.success)
            }

            Divider()

            VStack(alignment: .leading, spacing: 10) {
                Text("今日任务")
                    .font(.headline)
                if openTasks.isEmpty {
                    Text("暂无待完成任务")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(openTasks.prefix(4)) { task in
                        Button {
                            selectedKind = .tasks
                        } label: {
                            HStack(spacing: 10) {
                                Circle()
                                    .fill(ArkTheme.accent.opacity(0.18))
                                    .frame(width: 8, height: 8)
                                Text(task.title)
                                    .font(.callout.weight(.semibold))
                                    .lineLimit(1)
                                Spacer()
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            Spacer()
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .arkCard()
    }
}

private struct SummaryMetric: View {
    let title: String
    let value: String
    let symbol: String
    let tint: Color

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.title3.weight(.semibold))
                .foregroundStyle(tint)
                .frame(width: 38, height: 38)
                .background(tint.opacity(0.12), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(value)
                    .font(.title2.weight(.heavy))
                Text(title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(12)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private struct ArrangementTaskList: View {
    let tasks: [ArkTask]
    let completedTasks: [ArkTask]
    let actionInFlightId: String?
    let onComplete: (ArkTask) -> Void

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                if tasks.isEmpty {
                    ArrangementEmptyState(symbol: "checklist", title: "没有待完成任务", subtitle: "Web 端这里会显示今日任务卡片。")
                } else {
                    ForEach(tasks) { task in
                        ArrangementTaskCard(task: task, isBusy: actionInFlightId == task.id, onComplete: { onComplete(task) })
                    }
                }

                if !completedTasks.isEmpty {
                    HStack {
                        Text("已完成（\(completedTasks.count)）")
                            .font(.headline)
                            .foregroundStyle(.secondary)
                        Spacer()
                    }
                    .padding(.top, 12)

                    ForEach(completedTasks.prefix(6)) { task in
                        ArrangementCompletedRow(title: task.title)
                    }
                }
            }
            .padding(.vertical, 4)
        }
    }
}

private struct ArrangementAppointmentList: View {
    let appointments: [ArkAppointment]
    let actionInFlightId: String?
    let onComplete: (ArkAppointment) -> Void

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                if appointments.isEmpty {
                    ArrangementEmptyState(symbol: "calendar", title: "暂无近期日程", subtitle: "Web 端这里会显示日程卡片。")
                } else {
                    ForEach(appointments) { appointment in
                        ArrangementAppointmentCard(
                            appointment: appointment,
                            isBusy: actionInFlightId == appointment.id,
                            onComplete: { onComplete(appointment) }
                        )
                    }
                }
            }
            .padding(.vertical, 4)
        }
    }
}

private struct ArrangementTaskCard: View {
    let task: ArkTask
    let isBusy: Bool
    let onComplete: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            Circle()
                .fill(ArkTheme.accent.opacity(0.18))
                .frame(width: 10, height: 10)

            VStack(alignment: .leading, spacing: 8) {
                Text(task.title)
                    .font(.headline)
                    .lineLimit(1)
                HStack(spacing: 8) {
                    Label(task.appId?.uppercased() ?? "任务", systemImage: "tag")
                    Text(task.dueDate.map { formatArrangementDate($0) } ?? "未安排")
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            }

            Spacer()

            Button {
                onComplete()
            } label: {
                if isBusy {
                    ProgressView()
                } else {
                    Text("完成任务")
                        .font(.callout.weight(.bold))
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(isBusy)
        }
        .padding(16)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct ArrangementAppointmentCard: View {
    let appointment: ArkAppointment
    let isBusy: Bool
    let onComplete: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "calendar")
                .font(.title3.weight(.semibold))
                .foregroundStyle(ArkTheme.warning)
                .frame(width: 42, height: 42)
                .background(ArkTheme.warning.opacity(0.12), in: Circle())

            VStack(alignment: .leading, spacing: 8) {
                Text(appointment.title)
                    .font(.headline)
                    .lineLimit(1)
                Text("\(formatArrangementDate(appointment.startsAt ?? appointment.endsAt)) - \(formatArrangementDate(appointment.endsAt))")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button {
                onComplete()
            } label: {
                if isBusy {
                    ProgressView()
                } else {
                    Text(appointment.status == "needs_confirmation" ? "确认日程" : "完成")
                        .font(.callout.weight(.bold))
                }
            }
            .buttonStyle(.bordered)
            .disabled(isBusy)
        }
        .padding(16)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct ArrangementCompletedRow: View {
    let title: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(ArkTheme.success)
            Text(title)
                .font(.callout.weight(.semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Spacer()
        }
        .padding(12)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

private struct ArrangementEmptyState: View {
    let symbol: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.largeTitle)
                .foregroundStyle(ArkTheme.accent)
            Text(title)
                .font(.title3.weight(.bold))
            Text(subtitle)
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 260)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private func formatArrangementDate(_ date: Date) -> String {
    date.formatted(.dateTime.month(.twoDigits).day(.twoDigits).hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))
}
