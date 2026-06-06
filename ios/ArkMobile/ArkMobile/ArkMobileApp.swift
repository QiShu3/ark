import SwiftUI
import UIKit

@main
struct ArkMobileApp: App {
    @StateObject private var session = AppSession()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .background(LandscapeOrientationEnforcer())
        }
    }
}

private struct LandscapeOrientationEnforcer: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        let controller = UIViewController()
        DispatchQueue.main.async {
            enforceLandscape(from: controller)
        }
        return controller
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {
        DispatchQueue.main.async {
            enforceLandscape(from: uiViewController)
        }
    }

    private func enforceLandscape(from controller: UIViewController) {
        guard let windowScene = controller.view.window?.windowScene else { return }
        windowScene.requestGeometryUpdate(.iOS(interfaceOrientations: .landscape)) { error in
            #if DEBUG
            print("Landscape orientation request failed: \(error.localizedDescription)")
            #endif
        }
        controller.setNeedsUpdateOfSupportedInterfaceOrientations()
    }
}
