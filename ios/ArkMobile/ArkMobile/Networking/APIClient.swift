import Foundation

struct APIClient {
    var baseURL: URL
    var urlSession: URLSession = .shared

    init(baseURL: URL = AppConfiguration.apiBaseURL) {
        self.baseURL = baseURL
    }

    func get<T: Decodable>(_ path: String, token: String? = nil) async throws -> T {
        try await request(path, method: "GET", token: token, body: Optional<EmptyBody>.none)
    }

    func post<T: Decodable, Body: Encodable>(_ path: String, token: String? = nil, body: Body) async throws -> T {
        try await request(path, method: "POST", token: token, body: body)
    }

    func post<T: Decodable>(_ path: String, token: String? = nil) async throws -> T {
        try await request(path, method: "POST", token: token, body: Optional<EmptyBody>.none)
    }

    func patch<T: Decodable, Body: Encodable>(_ path: String, token: String? = nil, body: Body) async throws -> T {
        try await request(path, method: "PATCH", token: token, body: body)
    }

    func delete<T: Decodable>(_ path: String, token: String? = nil) async throws -> T {
        try await request(path, method: "DELETE", token: token, body: Optional<EmptyBody>.none)
    }

    private func request<T: Decodable, Body: Encodable>(
        _ path: String,
        method: String,
        token: String?,
        body: Body?
    ) async throws -> T {
        let url = try makeURL(path)
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let token, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            request.httpBody = try APIClient.encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await urlSession.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let backendError = try? APIClient.decoder.decode(BackendError.self, from: data)
            throw APIError.http(status: httpResponse.statusCode, message: backendError?.message ?? "HTTP \(httpResponse.statusCode)")
        }

        if T.self == EmptyResponse.self {
            return EmptyResponse() as! T
        }

        return try APIClient.decoder.decode(T.self, from: data)
    }

    private func makeURL(_ path: String) throws -> URL {
        if let absolute = URL(string: path), absolute.scheme != nil {
            return absolute
        }
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw APIError.invalidURL(path)
        }
        return url
    }

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            if let date = APIClient.iso8601WithFractionalSeconds.date(from: value)
                ?? APIClient.iso8601.date(from: value) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid ISO8601 date: \(value)")
        }
        return decoder
    }()

    private static let iso8601WithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let iso8601: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
}

enum APIError: LocalizedError {
    case invalidURL(String)
    case invalidResponse
    case http(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidURL(let path):
            "无效的 API 地址：\(path)"
        case .invalidResponse:
            "服务器响应无效"
        case .http(_, let message):
            message
        }
    }
}

struct AppConfiguration {
    static var apiBaseURL: URL {
        let rawValue = Bundle.main.object(forInfoDictionaryKey: "ARK_API_BASE_URL") as? String
        let value = rawValue?.isEmpty == false ? rawValue! : "http://127.0.0.1:8000"
        return URL(string: value)!
    }
}

struct EmptyBody: Encodable {}

struct EmptyResponse: Decodable {}

private struct BackendError: Decodable {
    let detail: BackendErrorDetail?

    var message: String? {
        detail?.message
    }
}

private enum BackendErrorDetail: Decodable {
    case text(String)
    case validation([ValidationError])

    var message: String? {
        switch self {
        case .text(let value):
            value
        case .validation(let errors):
            errors.first?.msg
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let text = try? container.decode(String.self) {
            self = .text(text)
            return
        }
        self = .validation((try? container.decode([ValidationError].self)) ?? [])
    }
}

private struct ValidationError: Decodable {
    let msg: String
}
