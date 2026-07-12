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


# ── 408 Fork demo data ──────────────────────────────────────────────

GUEST_408_SUBJECT_BANKS = {
    "data-structure": {
        "name": "408 数据结构专项",
        "description": "线性表、树、图与查找的基础专项训练",
        "subject": "数据结构",
        "questions": [
            ("栈的操作受限于表的一端，最符合其特点的描述是？", {"A": "先进先出", "B": "后进先出", "C": "随机访问", "D": "循环访问"}, "B", "栈只在栈顶插入和删除，遵循后进先出。"),
            ("一个含 n 个结点的二叉树，其边数为？", {"A": "n", "B": "n-1", "C": "n+1", "D": "2n"}, "B", "树中任意非根结点恰有一条来自父结点的边。"),
            ("对无向图进行深度优先遍历，常用的辅助数据结构是？", {"A": "队列", "B": "栈", "C": "优先队列", "D": "哈希表"}, "B", "深度优先遍历按最近访问的分支继续，栈最适合保存回溯路径。"),
            ("在有序顺序表中使用二分查找，其时间复杂度为？", {"A": "O(1)", "B": "O(log n)", "C": "O(n)", "D": "O(n log n)"}, "B", "每次比较将待查区间缩小一半。"),
            ("下列排序算法中，平均时间复杂度为 O(n log n) 且通常不稳定的是？", {"A": "冒泡排序", "B": "插入排序", "C": "快速排序", "D": "直接选择排序"}, "C", "快速排序的平均复杂度为 O(n log n)，标准实现通常不稳定。"),
        ],
    },
    "computer-organization": {
        "name": "408 计算机组成原理专项",
        "description": "数据表示、存储系统和处理器基础专项训练",
        "subject": "计算机组成原理",
        "questions": [
            ("在补码表示中，8 位有符号整数的取值范围是？", {"A": "-127 到 127", "B": "-128 到 127", "C": "-128 到 128", "D": "-255 到 255"}, "B", "n 位补码整数范围为 -2^(n-1) 到 2^(n-1)-1。"),
            ("CPU 访问速度最快的存储部件是？", {"A": "主存", "B": "磁盘", "C": "寄存器", "D": "高速缓存"}, "C", "寄存器直接位于 CPU 内部，访问速度最快。"),
            ("Cache 的主要作用是？", {"A": "永久保存数据", "B": "弥合 CPU 与主存速度差距", "C": "扩展指令集", "D": "管理进程调度"}, "B", "Cache 利用局部性原理减少 CPU 等待主存的时间。"),
            ("一条指令的执行通常包含取指、译码和执行等阶段，其中 PC 的主要作用是？", {"A": "保存当前指令地址", "B": "保存操作数", "C": "保存运算结果", "D": "保存状态字"}, "A", "程序计数器 PC 保存下一条待取指令的地址。"),
            ("DMA 方式传送数据时，数据直接在什么部件之间传送？", {"A": "CPU 与寄存器", "B": "外设与主存", "C": "Cache 与寄存器", "D": "外设与 Cache"}, "B", "DMA 控制器让外设与主存直接交换数据，减少 CPU 搬运开销。"),
        ],
    },
    "operating-system": {
        "name": "408 操作系统专项",
        "description": "进程、内存、文件与设备管理专项训练",
        "subject": "操作系统",
        "questions": [
            ("进程从运行态因时间片用完转为？", {"A": "阻塞态", "B": "就绪态", "C": "终止态", "D": "创建态"}, "B", "时间片用完只是失去处理机，进程仍具备运行条件，进入就绪队列。"),
            ("临界区互斥访问的基本要求不包括？", {"A": "空闲让进", "B": "忙则等待", "C": "有限等待", "D": "无限优先"}, "D", "临界区管理要求互斥、进展和有限等待，不存在无限优先。"),
            ("虚拟存储器管理中，缺页中断发生时通常需要？", {"A": "立即终止进程", "B": "从外存调入所需页面", "C": "清空全部页表", "D": "重启操作系统"}, "B", "缺页表示所访问页面不在内存，需要从外存调入。"),
            ("死锁的四个必要条件中，允许进程同时占有资源并等待其他资源称为？", {"A": "互斥", "B": "不可剥夺", "C": "请求与保持", "D": "循环等待"}, "C", "请求与保持是指进程已持有资源，同时请求新的资源。"),
            ("文件系统中，为用户提供文件名到物理块映射的是？", {"A": "文件目录", "B": "设备驱动", "C": "中断向量表", "D": "进程控制块"}, "A", "目录项保存文件控制信息，支持按文件名定位文件。"),
        ],
    },
    "computer-network": {
        "name": "408 计算机网络专项",
        "description": "分层模型、传输、路由与应用协议专项训练",
        "subject": "计算机网络",
        "questions": [
            ("TCP 协议位于 OSI 参考模型的哪一层？", {"A": "网络层", "B": "传输层", "C": "会话层", "D": "应用层"}, "B", "TCP 为应用提供端到端的可靠传输服务，属于传输层。"),
            ("IP 地址的主要作用是？", {"A": "标识网络接口并支持路由", "B": "标识应用进程", "C": "标识物理网卡厂商", "D": "加密报文内容"}, "A", "IP 地址用于在网络层标识接口并让路由器转发分组。"),
            ("DNS 的核心功能是？", {"A": "分配动态地址", "B": "域名解析为 IP 地址", "C": "传输网页内容", "D": "验证数字签名"}, "B", "DNS 将人类可读的域名解析为网络通信使用的 IP 地址。"),
            ("HTTP 默认使用的传输层协议是？", {"A": "TCP", "B": "UDP", "C": "ICMP", "D": "ARP"}, "A", "传统 HTTP 基于 TCP 提供可靠字节流传输。"),
            ("路由器转发 IP 数据报时，主要依据是？", {"A": "源 MAC 地址", "B": "目的 IP 地址", "C": "源端口号", "D": "应用层协议名"}, "B", "路由器根据目的 IP 地址查询路由表并决定下一跳。"),
        ],
    },
}


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

        # ── 408 Fork demo choice sets ──────────────────────────────
        async def seed_408_set(
            key: str,
            name: str,
            description: str,
            subject: str,
            questions: list[tuple[str, dict[str, str], str, str]],
        ) -> str:
            set_id = await conn.fetchval(
                """
                INSERT INTO choice_sets (key, name, description, exam, source_version, is_published, is_guest_only)
                VALUES ($1, $2, $3, '408', 'fork-demo-v1', true, true)
                ON CONFLICT (key) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    source_version = EXCLUDED.source_version,
                    is_published = true,
                    is_guest_only = true
                RETURNING id::text
                """,
                key,
                name,
                description,
            )
            article_id = f"{key}-article"
            article_pk = await conn.fetchval(
                """
                INSERT INTO choice_articles (set_id, article_id, exam, year, text_no, title, sort_order)
                VALUES ($1::uuid, $2, '408', 2026, 1, $3, 1)
                ON CONFLICT (article_id) DO UPDATE SET title = EXCLUDED.title
                RETURNING id::text
                """,
                set_id,
                article_id,
                subject,
            )
            for question_no, (stem, options, answer, explanation) in enumerate(questions, start=1):
                await conn.execute(
                    """
                    INSERT INTO choice_questions
                        (article_pk, question_id, question_no, stem, options_json, answer, evidence_json, explanation, question_type, sort_order)
                    VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6, '{}'::jsonb, $7, 'single', $3)
                    ON CONFLICT (question_id) DO UPDATE
                    SET stem = EXCLUDED.stem, options_json = EXCLUDED.options_json,
                        answer = EXCLUDED.answer, explanation = EXCLUDED.explanation
                    """,
                    article_pk,
                    f"{key}-q{question_no}",
                    question_no,
                    stem,
                    json.dumps(options, ensure_ascii=False),
                    answer,
                    explanation,
                )
            await conn.execute(
                "UPDATE choice_sets SET article_count = 1, question_count = $1 WHERE id = $2::uuid",
                len(questions),
                set_id,
            )
            return str(set_id)

        subject_bank_ids: dict[str, str] = {}
        combined_questions: list[tuple[str, dict[str, str], str, str]] = []
        for key, bank in GUEST_408_SUBJECT_BANKS.items():
            subject_bank_ids[key] = await seed_408_set(
                f"guest-408-{key}",
                bank["name"],
                bank["description"],
                bank["subject"],
                bank["questions"],
            )
            combined_questions.extend(bank["questions"])

        combined_408_id = await seed_408_set(
            "guest-408-combined",
            "408 综合检测",
            "覆盖数据结构、计算机组成原理、操作系统、计算机网络的 408 综合检测题库",
            "408 综合检测",
            combined_questions,
        )

    await pool.close()

    result = {
        "english_deck_id": str(deck_id),
        "math_set_id": str(math_set_id),
        "politics_set_id": str(politics_set_id),
        "combined_408_id": combined_408_id,
        "subject_408_ids": subject_bank_ids,
    }
    print("\n=== Guest Bank IDs ===")
    print(json.dumps(result, indent=2))
    print("\nPaste these IDs into lib/app_registry.py GUEST_APPS bank_ids.")


if __name__ == "__main__":
    asyncio.run(main())
