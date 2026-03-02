import Foundation
import KeychainAccess

// MARK: - Token Storage Protocol

/// Abstraction for token persistence so we can swap Keychain (release)
/// for UserDefaults (debug) to avoid macOS Keychain password prompts
/// that appear on every rebuild when code signing identity changes.
protocol TokenStorage {
    func get(_ key: String) throws -> String?
    func set(_ value: String, key: String) throws
    func remove(_ key: String) throws
}

/// Wraps KeychainAccess.Keychain to conform to TokenStorage.
final class KeychainTokenStorage: TokenStorage {
    private let keychain: Keychain

    init(serviceName: String) {
        self.keychain = Keychain(service: serviceName)
    }

    func get(_ key: String) throws -> String? {
        try keychain.get(key)
    }

    func set(_ value: String, key: String) throws {
        try keychain.set(value, key: key)
    }

    func remove(_ key: String) throws {
        try keychain.remove(key)
    }
}

#if DEBUG
/// Debug-only storage that uses UserDefaults instead of Keychain.
/// Avoids the macOS "wants to use your confidential information" prompt
/// that appears every time the app is rebuilt with a different signing identity.
final class UserDefaultsTokenStorage: TokenStorage {
    private let defaults = UserDefaults.standard
    private let prefix: String

    init(serviceName: String) {
        self.prefix = "\(serviceName).debug."
    }

    func get(_ key: String) throws -> String? {
        defaults.string(forKey: prefix + key)
    }

    func set(_ value: String, key: String) throws {
        defaults.set(value, forKey: prefix + key)
    }

    func remove(_ key: String) throws {
        defaults.removeObject(forKey: prefix + key)
    }
}
#endif

// MARK: - Auth Manager

public actor AuthManager {
    private let tokenStorage: TokenStorage
    private var accessToken: String?
    private var refreshToken: String?
    private var tokenExpiry: Date?
    public let baseURL: URL?

    /// In-flight refresh task to coalesce concurrent refresh requests.
    private var activeRefreshTask: Task<String, Error>?

    /// Response from the /auth/refresh endpoint.
    private struct RefreshResponse: Codable, Sendable {
        let accessToken: String
        let refreshToken: String
        let expiresIn: TimeInterval
    }

    public init(serviceName: String = "com.openraccoon.app", baseURL: URL? = nil) {
        #if DEBUG
        self.tokenStorage = UserDefaultsTokenStorage(serviceName: serviceName)
        #else
        self.tokenStorage = KeychainTokenStorage(serviceName: serviceName)
        #endif
        self.baseURL = baseURL
        self.accessToken = try? tokenStorage.get("access_token")
        self.refreshToken = try? tokenStorage.get("refresh_token")
        if let expiryString = try? tokenStorage.get("token_expiry"),
           let expiryInterval = Double(expiryString) {
            self.tokenExpiry = Date(timeIntervalSince1970: expiryInterval)
        }
    }

    public func validAccessToken() async throws -> String {
        // Return immediately if access token is still valid
        if let token = accessToken, let expiry = tokenExpiry, expiry > Date() {
            return token
        }

        // Attempt to refresh if a refresh token exists
        if refreshToken != nil {
            return try await coalescedRefresh()
        }

        throw APIError.unauthorized
    }

    /// Coalesces concurrent token refresh requests into a single network call.
    /// If a refresh is already in flight, subsequent callers await the same task.
    private func coalescedRefresh() async throws -> String {
        if let existing = activeRefreshTask {
            return try await existing.value
        }

        let task = Task<String, Error> { [weak self] in
            guard let self else { throw APIError.unauthorized }
            return try await self.refreshAccessToken()
        }
        activeRefreshTask = task

        do {
            let token = try await task.value
            activeRefreshTask = nil
            return token
        } catch {
            activeRefreshTask = nil
            throw error
        }
    }

    /// Refreshes the access token using the stored refresh token.
    /// On success, stores new tokens and returns the new access token.
    /// On failure, clears all tokens and throws `.unauthorized`.
    private func refreshAccessToken() async throws -> String {
        guard let currentRefresh = refreshToken else {
            throw APIError.unauthorized
        }

        guard let baseURL else {
            throw APIError.unauthorized
        }

        let endpoint = APIEndpoint.refresh(refreshToken: currentRefresh)
        var request = try endpoint.urlRequest(baseURL: baseURL)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            try clearTokens()
            throw APIError.unauthorized
        }

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            try clearTokens()
            throw APIError.unauthorized
        }

        let refreshResponse: RefreshResponse
        do {
            refreshResponse = try JSONDecoder.raccoon.decode(RefreshResponse.self, from: data)
        } catch {
            try clearTokens()
            throw APIError.unauthorized
        }

        try setTokens(
            access: refreshResponse.accessToken,
            refresh: refreshResponse.refreshToken,
            expiresIn: refreshResponse.expiresIn
        )

        return refreshResponse.accessToken
    }

    public func setTokens(access: String, refresh: String, expiresIn: TimeInterval) throws {
        self.accessToken = access
        self.refreshToken = refresh
        self.tokenExpiry = Date().addingTimeInterval(expiresIn)
        try tokenStorage.set(access, key: "access_token")
        try tokenStorage.set(refresh, key: "refresh_token")
        if let expiry = tokenExpiry {
            try tokenStorage.set(String(expiry.timeIntervalSince1970), key: "token_expiry")
        }
    }

    public func clearTokens() throws {
        self.accessToken = nil
        self.refreshToken = nil
        self.tokenExpiry = nil
        try tokenStorage.remove("access_token")
        try tokenStorage.remove("refresh_token")
        try tokenStorage.remove("token_expiry")
    }

    public var isAuthenticated: Bool {
        accessToken != nil
    }

    public var currentRefreshToken: String? {
        refreshToken
    }
}
