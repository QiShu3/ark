import Foundation

struct VocabDeck: Decodable, Identifiable {
    let id: String
    let key: String?
    let name: String
    let description: String?
    let wordCount: Int?
}

struct VocabTodaySummary: Decodable {
    let learningCount: Int
    let newCount: Int
    let reviewCount: Int
    let mistakeCount: Int
    let totalCount: Int
    let pendingCount: Int
    let completedCount: Int
    let dailyTargetCount: Int
    let memorizedCount: Int
}

struct VocabTranslation: Decodable, Identifiable {
    let pos: String?
    let translation: String

    var id: String {
        "\(pos ?? "")-\(translation)"
    }
}

struct VocabPhrase: Decodable, Identifiable {
    let phrase: String
    let translation: String

    var id: String {
        "\(phrase)-\(translation)"
    }
}

struct VocabSentence: Decodable, Identifiable {
    let sentence: String
    let translation: String

    var id: String {
        "\(sentence)-\(translation)"
    }
}

struct VocabReviewItem: Decodable, Identifiable {
    let id: String
    let deckId: String
    let word: String
    let usPronunciation: String?
    let ukPronunciation: String?
    let translations: [VocabTranslation]
    let phrases: [VocabPhrase]
    let sentences: [VocabSentence]
    let promptType: String
    let reviewMode: String
    let masteryScore: Double?
}

struct VocabWordDetail: Decodable {
    let id: String
    let deckId: String
    let word: String
    let usPronunciation: String?
    let ukPronunciation: String?
    let translations: [VocabTranslation]
    let phrases: [VocabPhrase]
    let sentences: [VocabSentence]
}

struct VocabCurrentWordBrief: Decodable, Identifiable {
    let id: String
}

struct VocabReviewSubmitPayload: Encodable {
    let deckId: String
    let wordId: String
    let result: String
    let reviewMode: String
    let promptType: String
    let responseMs: Int?
}

struct ERCVocabularyPreheatSubmitPayload: Encodable {
    let deckId: String
    let wordId: String
    let result: String
    let promptType: String
}

struct VocabReviewSubmitResult: Decodable {
    let masteryScore: Double
    let nextReviewAt: String
    let wrongCount: Int
    let correctCount: Int
    let intervalDays: Int
    let result: String
    let shouldRepeatToday: Bool
}

struct ERCOverview: Decodable {
    let practicedArticleCount: Int?
    let practicedQuestionCount: Int?
    let dueReviewCount: Int?
    let accuracy: Double?
    let mistakeCount: Int?
    let recommendedArticle: ERCRecommendedArticle?
}

struct ERCRecommendedArticle: Decodable {
    let articleId: String
    let year: Int
    let textNo: Int
    let title: String
}

struct ERCArticleListItem: Decodable, Identifiable {
    let articleId: String
    let year: Int
    let textNo: Int
    let title: String
    let setId: String?
    let status: String?
    let questionCount: Int?
    let mistakeCount: Int?
    let lastAttemptAt: String?

    var id: String {
        articleId
    }
}

struct ERCParagraph: Decodable, Identifiable {
    let paragraphNo: Int
    let text: String

    var id: Int {
        paragraphNo
    }
}

struct ERCQuestion: Decodable, Identifiable {
    let questionId: String
    let questionNo: Int
    let stem: String
    let options: [String: String]
    let answer: String?

    var id: String {
        questionId
    }
}

struct ERCReviewNext: Decodable {
    let hasItem: Bool
    let nextDueAt: String?
    let article: ERCRecommendedArticle?
    let paragraphs: [ERCParagraph]
    let question: ERCQuestion?
}

struct ERCReviewSubmitPayload: Encodable {
    let questionId: String
    let chosenOption: String
    let timeSpentMs: Int?
}

struct ERCReviewSubmitResult: Decodable {
    let questionId: String
    let chosenOption: String
    let correctOption: String
    let isCorrect: Bool
    let rating: String
    let nextReviewAt: String?
}

struct ERCPracticeAnswer: Encodable {
    let questionId: String
    let chosenOption: String
}

struct ERCArticleSubmitPayload: Encodable {
    let answers: [ERCPracticeAnswer]
    let timeSpentMs: Int?
}

struct ERCArticleSubmitResult: Decodable {
    let attemptId: String
    let articleId: String
    let correctCount: Int
    let questionCount: Int
    let items: [ERCArticleSubmitItem]
}

struct ERCArticleSubmitItem: Decodable, Identifiable {
    let questionId: String
    let questionNo: Int
    let chosenOption: String
    let correctOption: String
    let isCorrect: Bool
    let rating: String
    let nextReviewAt: String?
    let enteredMistakes: Bool

    var id: String {
        questionId
    }
}

struct ERCArticleVocabularyWord: Decodable, Identifiable {
    let word: String
    let state: String

    var id: String {
        "\(word)-\(state)"
    }
}

struct ERCArticleVocabularySummary: Decodable {
    let totalWordCount: Int
    let masteredCount: Int
    let learningCount: Int
    let unstartedCount: Int
    let unknownCount: Int
    let unfamiliarCount: Int
    let masteryRate: Double
    let previewWords: [ERCArticleVocabularyWord]
}

struct ERCArticleDetail: Decodable, Identifiable {
    let articleId: String
    let year: Int
    let textNo: Int
    let title: String
    let setId: String
    let exam: String
    let paragraphs: [ERCParagraph]
    let questions: [ERCQuestion]
    let lastAttemptAt: String?
    let vocabularySummary: ERCArticleVocabularySummary?

    var id: String {
        articleId
    }
}

struct AppTaskStatus: Decodable {
    let state: String
    let taskId: String?
    let configId: String?
    let eventId: String?
    let eventName: String?
    let blockedReason: String?
    let config: [String: JSONPrimitive]?
}

struct VocabAppTaskInitPayload: Encodable {
    let deckId: String
    let dailyTargetCount: Int
    let defaultFocusDuration: Int
    let addToTodayPlan: Bool
}

struct ERCAppTaskInitPayload: Encodable {
    let reviewScope: String
    let dailyQuestionTarget: Int
    let defaultFocusDuration: Int
    let addToTodayPlan: Bool
}

struct ERCPracticeAppTaskInitPayload: Encodable {
    let defaultFocusDuration: Int
    let addToTodayPlan: Bool
    let dailyArticleTarget: Int
}
