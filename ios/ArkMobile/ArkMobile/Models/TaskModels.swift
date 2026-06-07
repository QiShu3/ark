import Foundation

extension Notification.Name {
    static let arkFocusWorkflowDidChange = Notification.Name("arkFocusWorkflowDidChange")
    static let arkFocusWorkflowDidComplete = Notification.Name("arkFocusWorkflowDidComplete")
    static let arkScheduleDidChange = Notification.Name("arkScheduleDidChange")
}

struct ArkTask: Decodable, Identifiable {
    let id: String
    let title: String
    let content: String?
    let status: String
    let event: String
    let eventId: String?
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
    let sourceType: String?
    let appId: String?
    let appTaskType: String?
    let managedByApp: Bool

    var isDone: Bool { status == "done" }
}

struct ArkAppointment: Decodable, Identifiable {
    let id: String
    let title: String
    let content: String?
    let status: String
    let startsAt: Date?
    let endsAt: Date
    let repeatRule: String?
    let eventId: String?
    let isRecurring: Bool
    let periodType: String
    let customPeriodDays: Int?
    let maxCompletionsPerPeriod: Int
    let weekdayOnly: Bool
    let timeInheritsFromEvent: Bool
    let timeOverridden: Bool
}

struct ArkEvent: Decodable, Identifiable, Equatable {
    let id: String
    let name: String
    let startDate: String
    let dueAt: Date
    let isPrimary: Bool
    let createdAt: Date
    let updatedAt: Date
}

struct EventWorkbench: Decodable {
    let event: ArkEvent
    let createdTasks: [ArkTask]
    let createdAppointments: [ArkAppointment]
}

struct EventDeletePreview: Decodable {
    let tasksCount: Int
    let appointmentsCount: Int
    let workflowsCount: Int
    let appConfigsCount: Int
}

struct AchievementSummary: Decodable {
    let activeEvent: ArkEvent?
    let eventAchievements: AchievementSection?
    let globalAchievements: AchievementSection
}

struct AchievementSection: Decodable {
    let title: String
    let summaryText: String?
    let stats: AchievementStats
    let latestUnlocked: [AchievementItem]
    let upcoming: [AchievementItem]
}

struct AchievementStats: Decodable {
    let unlockedCount: Int
    let inProgressCount: Int
    let primaryMetricValue: Int?
    let primaryMetricLabel: String?
}

struct AchievementItem: Decodable, Identifiable {
    let id: String
    let title: String
    let description: String
    let status: String
    let currentValue: Int?
    let targetValue: Int?
    let progressText: String?
}

struct ERCConfigStatus: Decodable {
    let eventId: String?
    let eventName: String?
    let practice: ERCModuleStatus
    let review: ERCModuleStatus
}

struct ERCModuleStatus: Decodable {
    let enabled: Bool
    let state: String
    let taskId: String?
    let configId: String?
    let completionState: TaskCompletionState?
    let blockedReason: String?
    let config: [String: JSONPrimitive]
    let confirmationNeeded: Bool
}

struct TaskCompletionState: Decodable {
    let completionState: String
    let isCompletableNow: Bool
    let completedCountInPeriod: Int
    let remainingCompletionsInPeriod: Int
    let currentPeriodStart: String?
    let currentPeriodEnd: String?
    let blockedReason: String?
    let hiddenFromActionList: Bool
}

enum JSONPrimitive: Decodable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case null

    var stringValue: String? {
        if case .string(let value) = self {
            return value
        }
        return nil
    }

    var intValue: Int? {
        switch self {
        case .int(let value):
            return value
        case .double(let value):
            return Int(value)
        default:
            return nil
        }
    }

    var boolValue: Bool? {
        if case .bool(let value) = self {
            return value
        }
        return nil
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Int.self) {
            self = .int(value)
        } else if let value = try? container.decode(Double.self) {
            self = .double(value)
        } else {
            self = .string(try container.decode(String.self))
        }
    }
}

struct FocusWorkflow: Decodable {
    let id: String?
    let state: String?
    let workflowName: String?
    let taskTitle: String?
    let phaseName: String?
    let phaseType: String?
    let phasePlannedDuration: Int?
    let phaseTimerMode: String?
    let phaseStartedAt: Date?
    let elapsedSeconds: Int?
    let currentPhaseIndex: Int?
    let taskId: String?
    let activeFocusWorkType: String?
    let focusWorkDisplayState: String?
    let recordFocus: Bool?
    let activeTaskSourceType: String?
    let activeTaskAppTaskType: String?
    let remainingSeconds: Int?
    let pendingConfirmation: Bool?
    let pendingTaskSelection: Bool?
    let isPaused: Bool?
    let completedWorkflowName: String?
}

struct WorkflowPreset: Decodable, Identifiable {
    let id: String
    let name: String
    let icon: String?
    let focusDuration: Int?
    let breakDuration: Int?
    let defaultFocusTimerMode: String?
    let isDefault: Bool?
    let phases: [WorkflowPresetPhase]?
}

struct WorkflowPresetPhase: Decodable, Identifiable {
    let id = UUID()
    let phaseType: String
    let duration: Int
    let timerMode: String?
    let taskId: String?
    let focusWorkType: String?

    enum CodingKeys: String, CodingKey {
        case phaseType
        case duration
        case timerMode
        case taskId
        case focusWorkType
    }
}

struct TodayFocusSummary: Decodable {
    let minutes: Int
}

struct FocusWorkflowSelectTaskPayload: Encodable {
    let taskId: String
}

struct FocusWorkResultPayload: Encodable {
    let focusWorkType: String
    let result: String
    let progressSnapshot: [String: JSONValue]
}

enum JSONValue: Encodable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case null

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value):
            try container.encode(value)
        case .int(let value):
            try container.encode(value)
        case .double(let value):
            try container.encode(value)
        case .bool(let value):
            try container.encode(value)
        case .null:
            try container.encodeNil()
        }
    }
}

extension FocusWorkflow {
    func liveTimerSeconds(now: Date = Date()) -> Int {
        guard state != "normal" else { return 0 }

        if pendingConfirmation == true {
            return 0
        }

        if isPaused == true {
            if phaseTimerMode == "countup" {
                return max(0, elapsedSeconds ?? remainingSeconds ?? 0)
            }
            return max(0, remainingSeconds ?? 0)
        }

        if state == "focus", phaseTimerMode == "countup" {
            let baseElapsed = max(0, elapsedSeconds ?? 0)
            guard let phaseStartedAt else { return baseElapsed }
            return max(baseElapsed, Int(now.timeIntervalSince(phaseStartedAt).rounded()))
        }

        if let phaseStartedAt, let phasePlannedDuration {
            let elapsed = Int(now.timeIntervalSince(phaseStartedAt).rounded())
            return max(0, phasePlannedDuration - elapsed)
        }

        return max(0, remainingSeconds ?? 0)
    }

    var stateDisplay: String {
        switch state {
        case "focus": "专注中"
        case "break": "休息中"
        case "normal": "待开始"
        default: state ?? "待开始"
        }
    }

    var summary: String {
        let name = workflowName ?? "当前工作流"
        if let taskTitle {
            return "\(name)：\(taskTitle)"
        }
        return "\(name)：\(stateDisplay)"
    }

    func notifyCompletionIfNeeded() {
        guard state == "normal",
              let name = completedWorkflowName?.trimmingCharacters(in: .whitespacesAndNewlines),
              !name.isEmpty else {
            return
        }
        NotificationCenter.default.post(name: .arkFocusWorkflowDidComplete, object: name)
    }
}
