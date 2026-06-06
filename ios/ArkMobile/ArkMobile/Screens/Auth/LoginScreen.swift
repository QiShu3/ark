import SwiftUI

struct LoginScreen: View {
    @EnvironmentObject private var session: AppSession
    @State private var username = ""
    @State private var email = ""
    @State private var password = ""
    @State private var mode: Mode = .login
    @State private var isSubmitting = false

    enum Mode: String, CaseIterable, Identifiable {
        case login = "登录"
        case register = "注册"
        var id: String { rawValue }
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(.systemBackground), Color(.secondarySystemBackground)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 28) {
                    Text("Ark")
                        .font(.system(size: 68, weight: .heavy, design: .rounded))
                    Text("把今日安排、专注工作流、背词和阅读练习带到 iPad。")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: 460, alignment: .leading)
                    Spacer()
                    Label("连接现有 Ark 后端，当前默认 API：\(AppConfiguration.apiBaseURL.absoluteString)", systemImage: "network")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                .padding(64)
                .frame(maxWidth: .infinity, alignment: .leading)

                VStack(spacing: 22) {
                    Picker("模式", selection: $mode) {
                        ForEach(Mode.allCases) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)

                    VStack(spacing: 14) {
                        TextField("用户名", text: $username)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .textContentType(.username)
                        if mode == .register {
                            TextField("邮箱", text: $email)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .keyboardType(.emailAddress)
                                .textContentType(.emailAddress)
                        }
                        SecureField("密码", text: $password)
                            .textContentType(mode == .login ? .password : .newPassword)
                    }
                    .textFieldStyle(.roundedBorder)

                    if let error = session.lastError {
                        Text(error)
                            .font(.callout)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button {
                        submit()
                    } label: {
                        HStack {
                            if isSubmitting {
                                ProgressView()
                            }
                            Text(mode.rawValue)
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(isSubmitting || username.isEmpty || password.isEmpty || (mode == .register && email.isEmpty))
                }
                .padding(32)
                .frame(width: 420)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                .padding(64)
            }
        }
    }

    private func submit() {
        isSubmitting = true
        Task {
            switch mode {
            case .login:
                await session.login(username: username, password: password)
            case .register:
                await session.register(username: username, email: email, password: password)
            }
            isSubmitting = false
        }
    }
}
