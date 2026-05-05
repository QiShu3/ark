from routes.vocab.importer import parse_sentence_entry


def test_parse_sentence_entry_extracts_core_fields() -> None:
    payload = {
        "word": "talk",
        "us": "tɔk",
        "uk": "tɔːk",
        "translations": [{"translation": "说话；谈话", "type": "v"}],
        "phrases": [{"phrase": "talk about", "translation": "谈论某事"}],
        "sentences": [{"sentence": "I could hear Sarah talking.", "translation": "我能听到萨拉在说话。"}],
    }

    entry = parse_sentence_entry(payload, sort_order=7)

    assert entry.word == "talk"
    assert entry.us_pronunciation == "tɔk"
    assert entry.uk_pronunciation == "tɔːk"
    assert entry.sort_order == 7
    assert entry.translations[0].translation == "说话；谈话"
    assert entry.phrases[0].phrase == "talk about"
    assert entry.sentences[0].sentence == "I could hear Sarah talking."
