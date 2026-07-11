"""Seed demo banks for guest sub-apps.

Run: uv run python scripts/seed_guest_banks.py

Outputs bank IDs to stdout — paste them into lib/app_registry.py GUEST_APPS.bank_ids.
"""

import asyncio
import json
import os

import asyncpg

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/ark")


# ── English vocab data ──────────────────────────────────────────────

VOCAB_DATA = [
    {
        "word": "abandon",
        "translations": [{"pos": "v.", "translation": "放弃；抛弃"}],
        "sentence": "They had to abandon the project due to lack of funding.",
        "sentence_translation": "由于缺乏资金，他们不得不放弃该项目。",
    },
    {
        "word": "abstract",
        "translations": [{"pos": "adj.", "translation": "抽象的"}, {"pos": "n.", "translation": "摘要"}],
        "sentence": "The concept of beauty is abstract and varies among cultures.",
        "sentence_translation": "美的概念是抽象的，在不同文化中有所不同。",
    },
    {
        "word": "accelerate",
        "translations": [{"pos": "v.", "translation": "加速；促进"}],
        "sentence": "The government aims to accelerate economic growth.",
        "sentence_translation": "政府旨在加速经济增长。",
    },
    {
        "word": "accomplish",
        "translations": [{"pos": "v.", "translation": "完成；实现"}],
        "sentence": "She accomplished her goal of running a marathon.",
        "sentence_translation": "她完成了跑马拉松的目标。",
    },
    {
        "word": "accurate",
        "translations": [{"pos": "adj.", "translation": "精确的；准确的"}],
        "sentence": "The report provides an accurate description of the situation.",
        "sentence_translation": "该报告对情况进行了准确描述。",
    },
    {
        "word": "acknowledge",
        "translations": [{"pos": "v.", "translation": "承认；致谢"}],
        "sentence": "He acknowledged his mistake and apologized.",
        "sentence_translation": "他承认了自己的错误并道歉。",
    },
    {
        "word": "acquire",
        "translations": [{"pos": "v.", "translation": "获得；习得"}],
        "sentence": "Children acquire language through imitation and practice.",
        "sentence_translation": "儿童通过模仿和练习习得语言。",
    },
    {
        "word": "adapt",
        "translations": [{"pos": "v.", "translation": "适应；改编"}],
        "sentence": "Species must adapt to changing environments to survive.",
        "sentence_translation": "物种必须适应不断变化的环境才能生存。",
    },
    {
        "word": "adequate",
        "translations": [{"pos": "adj.", "translation": "充分的；适当的"}],
        "sentence": "The funding is adequate for the research project.",
        "sentence_translation": "这笔资金对该研究项目来说是足够的。",
    },
    {
        "word": "advocate",
        "translations": [{"pos": "v.", "translation": "提倡；主张"}, {"pos": "n.", "translation": "倡导者"}],
        "sentence": "Many scientists advocate for stronger climate policies.",
        "sentence_translation": "许多科学家主张更强有力的气候政策。",
    },
    {
        "word": "allocate",
        "translations": [{"pos": "v.", "translation": "分配；拨出"}],
        "sentence": "The budget was allocated across multiple departments.",
        "sentence_translation": "预算被分配到多个部门。",
    },
    {
        "word": "ambiguous",
        "translations": [{"pos": "adj.", "translation": "模棱两可的；含糊的"}],
        "sentence": "The contract contained several ambiguous clauses.",
        "sentence_translation": "合同中有几个含糊不清的条款。",
    },
    {
        "word": "analogy",
        "translations": [{"pos": "n.", "translation": "类比；类推"}],
        "sentence": "He drew an analogy between the brain and a computer.",
        "sentence_translation": "他在大脑和计算机之间做了一个类比。",
    },
    {
        "word": "anticipate",
        "translations": [{"pos": "v.", "translation": "预料；期望"}],
        "sentence": "We anticipate a significant increase in demand.",
        "sentence_translation": "我们预料需求会大幅增长。",
    },
    {
        "word": "apparent",
        "translations": [{"pos": "adj.", "translation": "明显的；表面上的"}],
        "sentence": "The solution was apparent after careful analysis.",
        "sentence_translation": "经过仔细分析，解决方案显而易见。",
    },
    {
        "word": "approach",
        "translations": [{"pos": "n.", "translation": "方法；途径"}, {"pos": "v.", "translation": "接近"}],
        "sentence": "We need a new approach to solve this problem.",
        "sentence_translation": "我们需要一种新方法来解决这个问题。",
    },
    {
        "word": "assume",
        "translations": [{"pos": "v.", "translation": "假设；承担"}],
        "sentence": "We cannot assume that the results will be the same.",
        "sentence_translation": "我们不能假设结果会相同。",
    },
    {
        "word": "authority",
        "translations": [{"pos": "n.", "translation": "权威；当局"}],
        "sentence": "The local authority approved the construction plan.",
        "sentence_translation": "地方当局批准了建设计划。",
    },
    {
        "word": "benefit",
        "translations": [{"pos": "n.", "translation": "利益；好处"}, {"pos": "v.", "translation": "受益"}],
        "sentence": "Regular exercise has significant health benefits.",
        "sentence_translation": "规律运动有显著的健康益处。",
    },
    {
        "word": "capable",
        "translations": [{"pos": "adj.", "translation": "有能力的；能干的"}],
        "sentence": "She is capable of handling complex tasks independently.",
        "sentence_translation": "她有能力独立处理复杂任务。",
    },
]


# ── Math choice data ────────────────────────────────────────────────

MATH_ARTICLES = [
    {
        "article_id": "guest-math-001",
        "exam": "考研数学二",
        "year": 2024,
        "text_no": 1,
        "title": "极限与连续",
        "paragraphs": [
            (1, "设函数 f(x) = (sin 3x) / (tan 2x)，当 x → 0 时的极限值为 L。"),
        ],
        "questions": [
            {
                "question_id": "guest-math-001-q1",
                "question_no": 1,
                "stem": "求极限 lim(x→0) (sin 3x) / (tan 2x)。",
                "options": {"A": "0", "B": "3/2", "C": "2/3", "D": "1"},
                "answer": "B",
                "explanation": "当 x→0 时，sin 3x ~ 3x，tan 2x ~ 2x，所以原式 = lim(3x/2x) = 3/2。",
            },
            {
                "question_id": "guest-math-001-q2",
                "question_no": 2,
                "stem": "设 f(x) 在 x=0 处连续，且 f(0)=1，则 lim(x→0) [f(x)-1]/x 存在是 f(x) 在 x=0 处可导的什么条件？",
                "options": {"A": "充分必要条件", "B": "充分非必要条件", "C": "必要非充分条件", "D": "既非充分也非必要条件"},
                "answer": "A",
                "explanation": "f(x) 在 x=0 处可导的充要条件是 lim(x→0) [f(x)-f(0)]/x 存在，即 lim(x→0) [f(x)-1]/x 存在。",
            },
            {
                "question_id": "guest-math-001-q3",
                "question_no": 3,
                "stem": "下列函数中，在 x=0 处不可导的是哪个？",
                "options": {"A": "f(x) = |x|", "B": "f(x) = x²", "C": "f(x) = sin x", "D": "f(x) = eˣ"},
                "answer": "A",
                "explanation": "f(x) = |x| 在 x=0 处左导数为 -1，右导数为 1，左右导数不相等，故不可导。其余函数在 x=0 处均可导。",
            },
        ],
    },
]


# ── Politics choice data ────────────────────────────────────────────

POLITICS_ARTICLES = [
    {
        "article_id": "guest-politics-001",
        "exam": "考研政治",
        "year": 2024,
        "text_no": 1,
        "title": "马克思主义基本原理",
        "paragraphs": [
            (1, "唯物辩证法认为，事物的发展是通过矛盾的运动实现的。矛盾是事物发展的根本动力。对立统一规律是唯物辩证法的实质和核心。"),
        ],
        "questions": [
            {
                "question_id": "guest-politics-001-q1",
                "question_no": 1,
                "stem": "唯物辩证法的实质和核心是什么？",
                "options": {"A": "质量互变规律", "B": "对立统一规律", "C": "否定之否定规律", "D": "联系和发展的规律"},
                "answer": "B",
                "explanation": "对立统一规律是唯物辩证法的实质和核心，它揭示了事物发展的源泉和动力。",
            },
            {
                "question_id": "guest-politics-001-q2",
                "question_no": 2,
                "stem": "矛盾的基本属性是什么？",
                "options": {"A": "普遍性和特殊性", "B": "同一性和斗争性", "C": "主要矛盾和次要矛盾", "D": "内因和外因"},
                "answer": "B",
                "explanation": "矛盾的基本属性是同一性和斗争性。同一性是指矛盾双方相互依存、相互贯通的性质；斗争性是指矛盾双方相互排斥、相互对立的性质。",
            },
            {
                "question_id": "guest-politics-001-q3",
                "question_no": 3,
                "stem": "量变和质变的辩证关系是什么？",
                "options": {
                    "A": "量变是质变的必要准备，质变是量变的必然结果",
                    "B": "质变是量变的必要准备，量变是质变的必然结果",
                    "C": "量变和质变互不相关",
                    "D": "量变直接等于质变",
                },
                "answer": "A",
                "explanation": "量变是质变的必要准备，质变是量变的必然结果。量变积累到一定程度必然引起质变。",
            },
        ],
    },
]


# ── 408 input data ──────────────────────────────────────────────────

INPUT_408_ARTICLES = [
    {
        "article_id": "guest-408-001",
        "title": "数据结构基础",
        "paragraphs": [
            (1, "栈是一种后进先出（LIFO）的线性数据结构。只允许在栈顶进行插入和删除操作。队列是一种先进先出（FIFO）的线性数据结构，允许在一端插入（队尾）另一端删除（队头）。"),
        ],
        "questions": [
            {
                "question_id": "guest-408-001-q1",
                "question_no": 1,
                "stem": "栈的特点是后进先出，简称____。",
                "mode": "fill",
                "accepted_answers": ["LIFO", "lifo"],
                "explanation": "栈（Stack）是一种后进先出（Last In First Out, LIFO）的数据结构。",
            },
            {
                "question_id": "guest-408-001-q2",
                "question_no": 2,
                "stem": "一个栈的入栈序列为 1, 2, 3, 4，则不可能的出栈序列是____。（用逗号分隔数字，如：1,2,3,4）",
                "mode": "fill",
                "accepted_answers": ["4,1,3,2", "4,1,2,3", "3,1,4,2", "3,1,2,4"],
                "explanation": "4最先出栈说明1,2,3,4全部入栈，然后4出栈。此时栈中从顶到底为3,2,1。接下来1不可能先出栈，因为3在1上面。所以4,1,3,2和4,1,2,3都不可能。同理可分析其他序列。",
            },
            {
                "question_id": "guest-408-001-q3",
                "question_no": 3,
                "stem": "队列的特点是先进先出，简称____。",
                "mode": "fill",
                "accepted_answers": ["FIFO", "fifo"],
                "explanation": "队列（Queue）是一种先进先出（First In First Out, FIFO）的数据结构。",
            },
        ],
    },
]


async def main() -> None:
    pool = await asyncpg.create_pool(dsn=DATABASE_URL, min_size=1, max_size=2)
    async with pool.acquire() as conn:
        # ── English vocab deck ──────────────────────────────────────
        deck_id = await conn.fetchval(
            """
            INSERT INTO vocab_decks (key, name, description, source_version, is_published, is_guest_only)
            VALUES ('guest-kaoyan-english', '考研英语二核心词汇', '考研英语二高频核心词汇精选', 'v1', true, true)
            ON CONFLICT (key) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                is_guest_only = true
            RETURNING id::text
            """
        )
        for i, w in enumerate(VOCAB_DATA):
            word_id = await conn.fetchval(
                """
                INSERT INTO vocab_words (deck_id, word, sort_order)
                VALUES ($1::uuid, $2, $3)
                ON CONFLICT (deck_id, word) DO UPDATE SET sort_order = EXCLUDED.sort_order
                RETURNING id::text
                """,
                deck_id, w["word"], i,
            )
            # translations
            for j, t in enumerate(w["translations"]):
                await conn.execute(
                    """
                    INSERT INTO vocab_word_translations (word_id, pos, translation, sort_order)
                    VALUES ($1::uuid, $2, $3, $4)
                    ON CONFLICT DO NOTHING
                    """,
                    word_id, t["pos"], t["translation"], j,
                )
            # example sentence
            if w.get("sentence"):
                await conn.execute(
                    """
                    INSERT INTO vocab_word_sentences (word_id, sentence, translation, sort_order)
                    VALUES ($1::uuid, $2, $3, 0)
                    ON CONFLICT DO NOTHING
                    """,
                    word_id, w["sentence"], w.get("sentence_translation", ""),
                )
        await conn.execute(
            "UPDATE vocab_decks SET word_count = (SELECT COUNT(*) FROM vocab_words WHERE deck_id = $1::uuid) WHERE id = $1::uuid",
            deck_id,
        )

        # ── Math choice set ─────────────────────────────────────────
        math_set_id = await conn.fetchval(
            """
            INSERT INTO choice_sets (key, name, description, exam, source_version, is_published, is_guest_only)
            VALUES ('guest-math-2', '数学二选择题精选', '考研数学二典型选择题训练', '考研数学二', 'v1', true, true)
            ON CONFLICT (key) DO UPDATE SET
                name = EXCLUDED.name,
                is_guest_only = true
            RETURNING id::text
            """
        )
        math_article_count = 0
        math_question_count = 0
        for art in MATH_ARTICLES:
            article_pk = await conn.fetchval(
                """
                INSERT INTO choice_articles (set_id, article_id, exam, year, text_no, title, sort_order)
                VALUES ($1::uuid, $2, $3, $4, $5, $6, 0)
                ON CONFLICT (article_id) DO UPDATE SET title = EXCLUDED.title
                RETURNING id::text
                """,
                math_set_id, art["article_id"], art["exam"], art["year"], art["text_no"], art["title"],
            )
            for pno, ptxt in art["paragraphs"]:
                await conn.execute(
                    """
                    INSERT INTO choice_paragraphs (article_pk, paragraph_no, text)
                    VALUES ($1::uuid, $2, $3)
                    ON CONFLICT (article_pk, paragraph_no) DO UPDATE SET text = EXCLUDED.text
                    """,
                    article_pk, pno, ptxt,
                )
            for q in art["questions"]:
                await conn.execute(
                    """
                    INSERT INTO choice_questions
                        (article_pk, question_id, question_no, stem, options_json, answer, evidence_json, explanation, question_type, sort_order)
                    VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6, '{}'::jsonb, $7, 'single', $3)
                    ON CONFLICT (question_id) DO UPDATE SET stem = EXCLUDED.stem, options_json = EXCLUDED.options_json, answer = EXCLUDED.answer, explanation = EXCLUDED.explanation
                    """,
                    article_pk, q["question_id"], q["question_no"], q["stem"],
                    json.dumps(q["options"], ensure_ascii=False), q["answer"], q["explanation"],
                )
            math_article_count += 1
            math_question_count += len(art["questions"])
        await conn.execute(
            "UPDATE choice_sets SET article_count = $1, question_count = $2 WHERE id = $3::uuid",
            math_article_count, math_question_count, math_set_id,
        )

        # ── Politics choice set ─────────────────────────────────────
        politics_set_id = await conn.fetchval(
            """
            INSERT INTO choice_sets (key, name, description, exam, source_version, is_published, is_guest_only)
            VALUES ('guest-politics', '政治理论选择题', '考研政治马原选择题精选', '考研政治', 'v1', true, true)
            ON CONFLICT (key) DO UPDATE SET
                name = EXCLUDED.name,
                is_guest_only = true
            RETURNING id::text
            """
        )
        pol_article_count = 0
        pol_question_count = 0
        for art in POLITICS_ARTICLES:
            article_pk = await conn.fetchval(
                """
                INSERT INTO choice_articles (set_id, article_id, exam, year, text_no, title, sort_order)
                VALUES ($1::uuid, $2, $3, $4, $5, $6, 0)
                ON CONFLICT (article_id) DO UPDATE SET title = EXCLUDED.title
                RETURNING id::text
                """,
                politics_set_id, art["article_id"], art["exam"], art["year"], art["text_no"], art["title"],
            )
            for pno, ptxt in art["paragraphs"]:
                await conn.execute(
                    """
                    INSERT INTO choice_paragraphs (article_pk, paragraph_no, text)
                    VALUES ($1::uuid, $2, $3)
                    ON CONFLICT (article_pk, paragraph_no) DO UPDATE SET text = EXCLUDED.text
                    """,
                    article_pk, pno, ptxt,
                )
            for q in art["questions"]:
                await conn.execute(
                    """
                    INSERT INTO choice_questions
                        (article_pk, question_id, question_no, stem, options_json, answer, evidence_json, explanation, question_type, sort_order)
                    VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6, '{}'::jsonb, $7, 'single', $3)
                    ON CONFLICT (question_id) DO UPDATE SET stem = EXCLUDED.stem, options_json = EXCLUDED.options_json, answer = EXCLUDED.answer, explanation = EXCLUDED.explanation
                    """,
                    article_pk, q["question_id"], q["question_no"], q["stem"],
                    json.dumps(q["options"], ensure_ascii=False), q["answer"], q["explanation"],
                )
            pol_article_count += 1
            pol_question_count += len(art["questions"])
        await conn.execute(
            "UPDATE choice_sets SET article_count = $1, question_count = $2 WHERE id = $3::uuid",
            pol_article_count, pol_question_count, politics_set_id,
        )

        # ── 408 input set ───────────────────────────────────────────
        input_set_id = await conn.fetchval(
            """
            INSERT INTO input_sets (key, name, description, exam, is_guest_only)
            VALUES ('guest-408', '408计算机综合训练', '数据结构、计算机组成原理、操作系统、计算机网络基础题', '408', true)
            ON CONFLICT (key) DO UPDATE SET
                name = EXCLUDED.name,
                is_guest_only = true
            RETURNING id::text
            """
        )
        inp_article_count = 0
        inp_question_count = 0
        for art in INPUT_408_ARTICLES:
            article_pk = await conn.fetchval(
                """
                INSERT INTO input_articles (set_id, article_id, title, sort_order)
                VALUES ($1::uuid, $2, $3, 0)
                ON CONFLICT (article_id) DO UPDATE SET title = EXCLUDED.title
                RETURNING id::text
                """,
                input_set_id, art["article_id"], art["title"],
            )
            for pno, ptxt in art["paragraphs"]:
                await conn.execute(
                    """
                    INSERT INTO input_paragraphs (article_pk, paragraph_no, text)
                    VALUES ($1::uuid, $2, $3)
                    ON CONFLICT (article_pk, paragraph_no) DO UPDATE SET text = EXCLUDED.text
                    """,
                    article_pk, pno, ptxt,
                )
            for q in art["questions"]:
                await conn.execute(
                    """
                    INSERT INTO input_questions
                        (article_pk, question_id, question_no, stem, mode, accepted_answers, explanation, sort_order)
                    VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb, $7, $3)
                    ON CONFLICT (question_id) DO UPDATE SET stem = EXCLUDED.stem, accepted_answers = EXCLUDED.accepted_answers
                    """,
                    article_pk, q["question_id"], q["question_no"], q["stem"],
                    q["mode"], json.dumps(q["accepted_answers"], ensure_ascii=False), q["explanation"],
                )
            inp_article_count += 1
            inp_question_count += len(art["questions"])
        await conn.execute(
            "UPDATE input_sets SET article_count = $1, question_count = $2 WHERE id = $3::uuid",
            inp_article_count, inp_question_count, input_set_id,
        )

    await pool.close()

    result = {
        "english_deck_id": str(deck_id),
        "math_set_id": str(math_set_id),
        "politics_set_id": str(politics_set_id),
        "input_408_id": str(input_set_id),
    }
    print("\n=== Guest Bank IDs ===")
    print(json.dumps(result, indent=2))
    print("\nPaste these IDs into lib/app_registry.py GUEST_APPS bank_ids.")


if __name__ == "__main__":
    asyncio.run(main())
