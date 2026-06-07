import SwiftUI

enum ArkTheme {
    static let shellBackground = Color(red: 0.93, green: 0.96, blue: 1.00)
    static let accent = Color(red: 0.22, green: 0.50, blue: 0.96)
    static let background = Color(red: 0.04, green: 0.06, blue: 0.10)
    static let panel = Color(red: 0.08, green: 0.11, blue: 0.17)
    static let panelSoft = Color(red: 0.11, green: 0.15, blue: 0.22)
    static let textMuted = Color.secondary
    static let success = Color(red: 0.20, green: 0.78, blue: 0.55)
    static let warning = Color(red: 0.95, green: 0.65, blue: 0.20)

    static let cardRadius: CGFloat = 18
    static let sectionSpacing: CGFloat = 20
}

struct ArkScreenBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background {
                LinearGradient(
                    colors: [
                        Color(.systemBackground),
                        Color(.secondarySystemBackground)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()
            }
    }
}

extension View {
    func arkScreenBackground() -> some View {
        modifier(ArkScreenBackground())
    }

    func arkCard() -> some View {
        padding(18)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: ArkTheme.cardRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: ArkTheme.cardRadius, style: .continuous)
                    .stroke(.separator.opacity(0.35), lineWidth: 1)
            }
    }
}

struct MetricTile: View {
    let title: String
    let value: String
    let symbol: String
    var tint: Color = ArkTheme.accent

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: symbol)
                .font(.title2)
                .foregroundStyle(tint)
            Text(value)
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .contentTransition(.numericText())
            Text(title)
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .arkCard()
    }
}

struct SubAppTabDescriptor<ID: Hashable>: Identifiable {
    let id: ID
    let title: String
    let symbol: String
}

struct SubAppTabSwitcher<ID: Hashable>: View {
    @Binding var selection: ID
    let tabs: [SubAppTabDescriptor<ID>]

    var body: some View {
        HStack(spacing: 12) {
            ForEach(tabs) { tab in
                Button {
                    selection = tab.id
                } label: {
                    Label(tab.title, systemImage: tab.symbol)
                        .font(.callout.weight(.semibold))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .frame(minWidth: 118)
                }
                .buttonStyle(.plain)
                .foregroundStyle(selection == tab.id ? .white : .primary)
                .background(
                    selection == tab.id ? ArkTheme.accent : Color.white.opacity(0.42),
                    in: Capsule()
                )
                .overlay {
                    Capsule()
                        .stroke(.white.opacity(selection == tab.id ? 0 : 0.55), lineWidth: 1)
                }
            }

            Spacer()
        }
    }
}

struct SubAppMetricItem: Identifiable {
    let id = UUID()
    let label: String
    let value: String
    let detail: String
}

struct SubAppHeroCard<Toolbar: View>: View {
    let eyebrow: String
    let title: String
    let statusLabel: String
    let metaItems: [String]
    let progressPercent: Int
    let progressLabel: String
    let heroEyebrow: String
    let heroLabel: String
    let heroValue: String
    let heroDetail: String
    let primaryActionTitle: String
    let isPrimaryActionDisabled: Bool
    let isActing: Bool
    let metrics: [SubAppMetricItem]
    let toolbar: Toolbar
    let onPrimaryAction: () -> Void

    init(
        eyebrow: String,
        title: String,
        statusLabel: String,
        metaItems: [String],
        progressPercent: Int,
        progressLabel: String,
        heroEyebrow: String,
        heroLabel: String,
        heroValue: String,
        heroDetail: String,
        primaryActionTitle: String,
        isPrimaryActionDisabled: Bool,
        isActing: Bool,
        metrics: [SubAppMetricItem],
        @ViewBuilder toolbar: () -> Toolbar,
        onPrimaryAction: @escaping () -> Void
    ) {
        self.eyebrow = eyebrow
        self.title = title
        self.statusLabel = statusLabel
        self.metaItems = metaItems
        self.progressPercent = progressPercent
        self.progressLabel = progressLabel
        self.heroEyebrow = heroEyebrow
        self.heroLabel = heroLabel
        self.heroValue = heroValue
        self.heroDetail = heroDetail
        self.primaryActionTitle = primaryActionTitle
        self.isPrimaryActionDisabled = isPrimaryActionDisabled
        self.isActing = isActing
        self.metrics = metrics
        self.toolbar = toolbar()
        self.onPrimaryAction = onPrimaryAction
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 28) {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(eyebrow)
                                .font(.caption.weight(.semibold))
                                .tracking(6)
                                .foregroundStyle(.secondary)
                            Text(title)
                                .font(.system(size: 38, weight: .semibold))
                        }

                        Spacer()
                        toolbar
                    }

                    HStack(spacing: 10) {
                        Text(statusLabel)
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(.thinMaterial, in: Capsule())

                        ForEach(metaItems, id: \.self) { item in
                            Text(item)
                        }
                    }
                    .font(.callout)
                    .foregroundStyle(.secondary)

                    Spacer(minLength: 0)
                }

                HStack(spacing: 24) {
                    ProgressRing(percent: progressPercent, label: progressLabel)
                        .frame(width: 128, height: 128)

                    VStack(alignment: .leading, spacing: 10) {
                        Text(heroEyebrow)
                            .font(.caption.weight(.semibold))
                            .tracking(4)
                            .foregroundStyle(ArkTheme.accent)
                        Text(heroLabel)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                        Text(heroValue)
                            .font(.system(size: 40, weight: .semibold))
                        Text(heroDetail)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)

                        Button(action: onPrimaryAction) {
                            if isActing {
                                ProgressView()
                                    .frame(maxWidth: .infinity)
                            } else {
                                Text(primaryActionTitle)
                                    .frame(maxWidth: .infinity)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.white)
                        .foregroundStyle(.primary)
                        .controlSize(.large)
                        .disabled(isPrimaryActionDisabled)
                    }
                    .frame(width: 240, alignment: .leading)
                }
                .padding(.leading, 28)
                .overlay(alignment: .leading) {
                    Rectangle()
                        .fill(ArkTheme.accent.opacity(0.20))
                        .frame(width: 1)
                }
            }
            .padding(24)
            .frame(minHeight: 235)

            Divider()
                .opacity(0.55)

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 4), spacing: 12) {
                ForEach(metrics) { metric in
                    SubAppMetricChip(metric: metric)
                }
            }
            .padding(18)
            .background(ArkTheme.accent.opacity(0.055))
        }
        .subAppGlassCard(cornerRadius: 12)
    }
}

struct SubAppMetricChip: View {
    let metric: SubAppMetricItem

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(metric.label)
                .font(.callout)
                .foregroundStyle(.secondary)
            Text(metric.value)
                .font(.system(size: 26, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Text(metric.detail)
                .font(.caption.weight(.medium))
                .tracking(2.4)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 13)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(.white.opacity(0.45), lineWidth: 1)
        }
    }
}

struct SubAppSectionHeading: View {
    let eyebrow: String
    let title: String
    let description: String?
    var accent: Color = ArkTheme.accent

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(eyebrow)
                .font(.caption.weight(.semibold))
                .tracking(5)
                .foregroundStyle(accent)
            Text(title)
                .font(.title2.weight(.semibold))
            if let description {
                Text(description)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.leading, 18)
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(accent)
                .frame(width: 4)
        }
    }
}

struct SubAppStatusPill: View {
    let text: String
    let tint: Color

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(tint.opacity(0.14), in: Capsule())
            .overlay {
                Capsule()
                    .stroke(tint.opacity(0.32), lineWidth: 1)
            }
            .foregroundStyle(tint)
    }
}

struct SubAppScheduleCard: View {
    let accent: Color
    let title: String
    let emptyTitle: String
    let emptyDetail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label(title, systemImage: "calendar")
                .font(.headline)
                .foregroundStyle(accent)
            VStack(spacing: 6) {
                Image(systemName: "calendar")
                    .font(.title)
                    .foregroundStyle(.secondary)
                Text(emptyTitle)
                    .font(.callout.weight(.semibold))
                Text(emptyDetail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, minHeight: 110)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(.separator.opacity(0.30), style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
            }
        }
        .frame(width: 320, alignment: .topLeading)
        .frame(minHeight: 160, alignment: .topLeading)
        .padding(20)
        .background(accent.opacity(0.055), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(accent.opacity(0.20), lineWidth: 1)
        }
    }
}

struct SubAppManagedTaskCard: View {
    let accent: Color
    let title: String
    let symbol: String
    let statusText: String
    let statusTint: Color
    let focusWorkName: String
    let disabledReason: String?
    let syncLabel: String?
    let isSynced: Bool
    let isSyncEnabled: Bool
    let primaryActionTitle: String?
    let primaryActionSymbol: String
    let isPrimaryActionDisabled: Bool
    let showPrimaryProgress: Bool
    let onSyncToggle: ((Bool) -> Void)?
    let onPrimaryAction: (() -> Void)?
    let onConfigure: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label(title, systemImage: symbol)
                .font(.headline)
                .foregroundStyle(accent)

            HStack {
                SubAppStatusPill(text: statusText, tint: statusTint)
                Spacer()
                Text("绑定专注工作：\(focusWorkName)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let disabledReason {
                Text(disabledReason)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            HStack(alignment: .center, spacing: 14) {
                if let syncLabel {
                    HStack(spacing: 12) {
                        Text(syncLabel)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Toggle("", isOn: Binding(
                            get: { isSynced },
                            set: { onSyncToggle?($0) }
                        ))
                        .labelsHidden()
                        .disabled(!isSyncEnabled || onSyncToggle == nil)
                    }
                }

                Spacer()

                HStack(spacing: 10) {
                    if let primaryActionTitle, let onPrimaryAction {
                        Button(action: onPrimaryAction) {
                            if showPrimaryProgress {
                                ProgressView()
                            } else {
                                Label(primaryActionTitle, systemImage: primaryActionSymbol)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.white)
                        .foregroundStyle(.primary)
                        .disabled(isPrimaryActionDisabled)
                    }

                    Button("配置", action: onConfigure)
                        .buttonStyle(.bordered)
                }
            }
        }
        .frame(maxWidth: .infinity, minHeight: 168, alignment: .topLeading)
        .padding(20)
        .background(accent.opacity(0.055), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(accent.opacity(0.20), lineWidth: 1)
        }
    }
}

struct SubAppSettingsFormScreen<Content: View>: View {
    let title: String
    let isSaving: Bool
    let isSaveDisabled: Bool
    let onCancel: () -> Void
    let onSave: () -> Void
    let content: Content

    init(
        title: String,
        isSaving: Bool,
        isSaveDisabled: Bool = false,
        onCancel: @escaping () -> Void,
        onSave: @escaping () -> Void,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.isSaving = isSaving
        self.isSaveDisabled = isSaveDisabled
        self.onCancel = onCancel
        self.onSave = onSave
        self.content = content()
    }

    var body: some View {
        NavigationStack {
            Form {
                content
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消", action: onCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(action: onSave) {
                        if isSaving {
                            ProgressView()
                        } else {
                            Text("保存")
                        }
                    }
                    .disabled(isSaving || isSaveDisabled)
                }
            }
        }
    }
}

struct ProgressRing: View {
    let percent: Int
    let label: String

    init(percent: Int, label: String = "") {
        self.percent = percent
        self.label = label
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.white.opacity(0.45), lineWidth: 14)
            Circle()
                .trim(from: 0, to: CGFloat(max(0, min(percent, 100))) / 100)
                .stroke(
                    AngularGradient(colors: [ArkTheme.accent, ArkTheme.success], center: .center),
                    style: StrokeStyle(lineWidth: 14, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
            VStack(spacing: 4) {
                Text("\(percent)%")
                    .font(.system(size: 26, weight: .semibold))
                if !label.isEmpty {
                    Text(label)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

extension View {
    func subAppGlassCard(cornerRadius: CGFloat = 12) -> some View {
        background(.regularMaterial, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(.white.opacity(0.50), lineWidth: 1)
            }
            .shadow(color: .black.opacity(0.04), radius: 18, x: 0, y: 10)
    }
}

enum SubAppRuntimeState: String {
    case uninitialized
    case ready
    case completedToday = "completed_today"
    case blocked
    case configInvalid = "config_invalid"
    case noPrimaryEvent = "no_primary_event"
    case eventNotConfigured = "event_not_configured"
}

enum SubAppManagedDisplayState {
    case pending
    case ready
    case completed
    case blocked

    var label: String {
        switch self {
        case .pending: "未初始化"
        case .ready: "进行中"
        case .completed: "已完成"
        case .blocked: "不可用"
        }
    }

    var tint: Color {
        switch self {
        case .pending: ArkTheme.warning
        case .ready: ArkTheme.success
        case .completed: ArkTheme.accent
        case .blocked: .red
        }
    }
}

func subAppRuntimeState(_ rawValue: String?) -> SubAppRuntimeState? {
    guard let rawValue else { return nil }
    return SubAppRuntimeState(rawValue: rawValue)
}

func subAppHasManagedConfig(_ rawValue: String?) -> Bool {
    guard let state = subAppRuntimeState(rawValue) else { return false }
    return ![.noPrimaryEvent, .eventNotConfigured, .uninitialized, .configInvalid].contains(state)
}

func subAppEventStatusText(state rawValue: String?, hasManagedConfig: Bool? = nil) -> String {
    guard let state = subAppRuntimeState(rawValue) else { return "读取配置中" }
    if state == .noPrimaryEvent { return "未绑定计划事件" }
    if state == .eventNotConfigured { return "待配置计划事件" }
    if hasManagedConfig ?? subAppHasManagedConfig(rawValue) { return "已绑定计划事件" }
    return "待初始化计划事件"
}

func subAppEventLabel(state rawValue: String?, eventName: String?) -> String {
    if subAppRuntimeState(rawValue) == .noPrimaryEvent {
        return "计划事件：未绑定"
    }
    if let eventName {
        return "计划事件：\(eventName)"
    }
    return "计划事件：当前主事件"
}

func subAppManagedDisplayState(
    state rawValue: String?,
    enabled: Bool = true,
    completedOverride: Bool = false
) -> SubAppManagedDisplayState {
    if completedOverride {
        return .completed
    }
    guard enabled, let state = subAppRuntimeState(rawValue) else { return .pending }
    switch state {
    case .completedToday:
        return .completed
    case .ready:
        return .ready
    case .uninitialized, .eventNotConfigured:
        return .pending
    case .blocked, .configInvalid, .noPrimaryEvent:
        return .blocked
    }
}

func subAppManagedStatusText(
    state rawValue: String?,
    enabled: Bool = true,
    completedOverride: Bool = false
) -> String {
    if !enabled {
        return "未启用"
    }
    return subAppManagedDisplayState(state: rawValue, enabled: enabled, completedOverride: completedOverride).label
}

func subAppDisabledReason(state rawValue: String?, blockedReason: String?) -> String? {
    if subAppRuntimeState(rawValue) == .noPrimaryEvent {
        return "请先创建或设置主事件。"
    }
    return blockedReason
}
