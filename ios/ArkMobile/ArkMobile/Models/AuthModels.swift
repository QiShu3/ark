import Foundation

struct ArkUser: Decodable, Identifiable {
    let id: Int
    let username: String
    let email: String?
    let emailVerifiedAt: Date?
    let isActive: Bool
    let isAdmin: Bool
    let createdAt: Date
    let avatarUrl: String?
}

struct LoginRequest: Encodable {
    let username: String
    let password: String
}

struct RegisterRequest: Encodable {
    let username: String
    let email: String
    let password: String
}

struct LoginResponse: Decodable {
    let accessToken: String
    let tokenType: String
    let expiresIn: Int
}
