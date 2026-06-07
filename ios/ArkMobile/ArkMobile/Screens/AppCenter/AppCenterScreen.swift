import SwiftUI

struct AppCenterScreen: View {
    let onNavigate: (AppSection) -> Void

    private let apps: [AppCenterItem] = [
        AppCenterItem(
            title: "背单词",
            subtitle: "切换词书并开始今日学习",
            symbol: "book",
            tint: ArkTheme.accent,
            destination: .vocab
        ),
        AppCenterItem(
            title: "阅读训练",
            subtitle: "整篇练习并进入 FSRS 复习池",
            symbol: "scroll",
            tint: ArkTheme.accent,
            destination: .erc
        )
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .center, spacing: 40) {
                VStack(spacing: 8) {
                    Text("应用中心")
                        .font(.title.weight(.bold))
                        .foregroundStyle(.primary)
                    Text("选择一个学习工具开始")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 36)

                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 260, maximum: 300), spacing: 16)],
                    spacing: 16
                ) {
                    ForEach(apps) { app in
                        AppCenterCard(app: app) {
                            onNavigate(app.destination)
                        }
                    }
                }
                .frame(maxWidth: 920)

                Spacer(minLength: 24)
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 32)
            .padding(.bottom, 40)
        }
        .navigationTitle("应用中心")
        .background(ArkTheme.shellBackground.ignoresSafeArea())
    }
}

private struct AppCenterItem: Identifiable {
    let id = UUID()
    let title: String
    let subtitle: String
    let symbol: String
    let tint: Color
    let destination: AppSection
}

private struct AppCenterCard: View {
    let app: AppCenterItem
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 16) {
                Image(systemName: app.symbol)
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundStyle(app.tint)
                    .frame(width: 48, height: 48)
                    .background(app.tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                VStack(alignment: .leading, spacing: 6) {
                    Text(app.title)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)

                    Text(app.subtitle)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 28)
            .frame(maxWidth: .infinity, minHeight: 180, alignment: .leading)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(.separator.opacity(0.35), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(app.title)，\(app.subtitle)")
    }
}
