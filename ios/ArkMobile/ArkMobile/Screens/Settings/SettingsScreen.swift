import SwiftUI

struct SettingsScreen: View {
    @EnvironmentObject private var session: AppSession

    var body: some View {
        Form {
            Section("账号") {
                LabeledContent("用户名", value: session.user?.username ?? "-")
                LabeledContent("邮箱", value: session.user?.email ?? "-")
                Button("退出登录", role: .destructive) {
                    session.logout()
                }
            }

            Section("后端") {
                LabeledContent("API Base URL", value: AppConfiguration.apiBaseURL.absoluteString)
            }

            Section("App Store 前待补") {
                Label("账号删除入口", systemImage: "person.crop.circle.badge.xmark")
                Label("隐私政策和数据说明", systemImage: "lock.shield")
                Label("正式 HTTPS API 配置", systemImage: "network.badge.shield.half.filled")
            }
        }
        .navigationTitle("设置")
    }
}
