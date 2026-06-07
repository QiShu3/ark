import SwiftUI

struct FocusWorkRuntimeActions {
    let completeTaskAndFinish: () async -> Bool
    let stopFocus: () async -> Void
}

struct FocusWorkDefinition {
    let type: String
    let title: String
    let subtitle: String
    let render: (_ workflow: FocusWorkflow, _ actions: FocusWorkRuntimeActions) -> AnyView
}

enum FocusWorkRegistry {
    static func definition(for type: String?) -> FocusWorkDefinition {
        switch type {
        case "vocab_today":
            FocusWorkDefinition(
                type: "vocab_today",
                title: "今日单词",
                subtitle: "背单词",
                render: { workflow, actions in
                    AnyView(
                        VocabFocusWorkContent(
                            isPaused: workflow.isPaused == true,
                            onCompleteTaskAndFinish: actions.completeTaskAndFinish,
                            onStopFocus: actions.stopFocus
                        )
                    )
                }
            )
        case "erc_review":
            FocusWorkDefinition(
                type: "erc_review",
                title: "开始复习",
                subtitle: "ERC 阅读理解",
                render: { workflow, actions in
                    AnyView(
                        ERCReviewFocusWorkContent(
                            isPaused: workflow.isPaused == true,
                            onCompleteTaskAndFinish: actions.completeTaskAndFinish,
                            onStopFocus: actions.stopFocus
                        )
                    )
                }
            )
        case "erc_practice":
            FocusWorkDefinition(
                type: "erc_practice",
                title: "真题练习",
                subtitle: "ERC 阅读理解",
                render: { workflow, actions in
                    AnyView(
                        ERCPracticeFocusWorkContent(
                            isPaused: workflow.isPaused == true,
                            onCompleteTaskAndFinish: { _ = await actions.completeTaskAndFinish() },
                            onStopFocus: actions.stopFocus
                        )
                    )
                }
            )
        case "task_focus":
            taskFocusDefinition
        default:
            taskFocusDefinition
        }
    }

    private static var taskFocusDefinition: FocusWorkDefinition {
        FocusWorkDefinition(
            type: "task_focus",
            title: "任务专注",
            subtitle: "自定义任务",
            render: { workflow, _ in
                AnyView(
                    FocusWorkPlaceholderCard(
                        symbol: "timer",
                        title: "任务专注",
                        subtitle: "这里应该承载 TaskFocusWork：当前任务内容和完成动作。",
                        taskTitle: workflow.taskTitle
                    )
                )
            }
        )
    }
}

private struct FocusWorkPlaceholderCard: View {
    let symbol: String
    let title: String
    let subtitle: String
    let taskTitle: String?

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: symbol)
                .font(.system(size: 72, weight: .semibold))
                .foregroundStyle(ArkTheme.accent)
            Text(title)
                .font(.system(size: 44, weight: .heavy, design: .rounded))
            Text(subtitle)
                .font(.title3)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 760)
            if let taskTitle {
                Text(taskTitle)
                    .font(.headline)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(.thinMaterial, in: Capsule())
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 32, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 32, style: .continuous)
                .stroke(.white.opacity(0.55), lineWidth: 1)
        }
    }
}
