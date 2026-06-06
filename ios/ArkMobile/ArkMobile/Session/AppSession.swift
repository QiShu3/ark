import Foundation

@MainActor
final class AppSession: ObservableObject {
    @Published private(set) var token: String?
    @Published private(set) var user: ArkUser?
    @Published var isRestoring = false
    @Published var lastError: String?

    let api = APIClient()
    private let tokenStore = KeychainTokenStore()

    var isAuthenticated: Bool {
        token != nil
    }

    func restore() async {
        guard token == nil, !isRestoring else { return }
        isRestoring = true
        defer { isRestoring = false }

        do {
            guard let savedToken = tokenStore.load() else { return }
            token = savedToken
            user = try await api.get("/auth/me", token: savedToken)
        } catch {
            tokenStore.clear()
            token = nil
            user = nil
        }
    }

    func login(username: String, password: String) async {
        lastError = nil
        do {
            let response: LoginResponse = try await api.post(
                "/auth/login",
                body: LoginRequest(username: username, password: password)
            )
            tokenStore.save(response.accessToken)
            token = response.accessToken
            user = try await api.get("/auth/me", token: response.accessToken)
        } catch {
            lastError = error.localizedDescription
        }
    }

    func register(username: String, email: String, password: String) async {
        lastError = nil
        do {
            let _: ArkUser = try await api.post(
                "/auth/register",
                body: RegisterRequest(username: username, email: email, password: password)
            )
            await login(username: username, password: password)
        } catch {
            lastError = error.localizedDescription
        }
    }

    func logout() {
        tokenStore.clear()
        token = nil
        user = nil
    }
}
