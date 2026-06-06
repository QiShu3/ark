import SwiftUI

struct RootView: View {
    @EnvironmentObject private var session: AppSession
    @State private var selection: AppSection? = .home

    var body: some View {
        Group {
            if session.isAuthenticated {
                ArkShellScreen(selection: $selection)
            } else {
                LoginScreen()
            }
        }
        .task {
            await session.restore()
        }
    }
}

enum AppSection: String, CaseIterable, Identifiable {
    case home
    case tasks
    case focus
    case vocab
    case erc
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: "首页"
        case .tasks: "今日安排"
        case .focus: "专注"
        case .vocab: "Vocab"
        case .erc: "ERC"
        case .settings: "设置"
        }
    }

    var symbol: String {
        switch self {
        case .home: "house"
        case .tasks: "calendar"
        case .focus: "timer"
        case .vocab: "textformat.abc"
        case .erc: "book.pages"
        case .settings: "gearshape"
        }
    }
}

struct AppSidebar: View {
    @Binding var selection: AppSection?

    var body: some View {
        List(AppSection.allCases, selection: $selection) { section in
            Label(section.title, systemImage: section.symbol)
                .tag(section)
        }
        .navigationTitle("Ark")
        .listStyle(.sidebar)
    }
}

struct AppDetailView: View {
    let selection: AppSection

    var body: some View {
        switch selection {
        case .home:
            HomeDashboardScreen()
        case .tasks:
            TasksScreen()
        case .focus:
            FocusScreen()
        case .vocab:
            VocabScreen()
        case .erc:
            ERCScreen()
        case .settings:
            SettingsScreen()
        }
    }
}
