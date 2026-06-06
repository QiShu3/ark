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
