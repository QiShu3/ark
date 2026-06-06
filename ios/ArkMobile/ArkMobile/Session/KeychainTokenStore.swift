import Foundation
import Security

struct KeychainTokenStore {
    private let service = "xin.strangetalking.ark.mobile"
    private let account = "access-token"
    private let fallbackKey = "ark.mobile.access-token.fallback"

    func save(_ token: String) {
        clear()
        let data = Data(token.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data
        ]

        let status = SecItemAdd(query as CFDictionary, nil)
        if status != errSecSuccess {
            UserDefaults.standard.set(token, forKey: fallbackKey)
        }
    }

    func load() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound {
            return UserDefaults.standard.string(forKey: fallbackKey)
        }
        guard status == errSecSuccess else {
            return UserDefaults.standard.string(forKey: fallbackKey)
        }
        guard let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8) ?? UserDefaults.standard.string(forKey: fallbackKey)
    }

    func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
        UserDefaults.standard.removeObject(forKey: fallbackKey)
    }
}
