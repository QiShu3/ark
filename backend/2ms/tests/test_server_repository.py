import json

from mini_agent.server.repository import _decode_json_object


def test_decode_json_object_accepts_dict_values():
    value = {"llm": {"model": "demo"}}

    assert _decode_json_object(value) == value


def test_decode_json_object_parses_json_strings():
    value = json.dumps({"tts": {"enabled": True}})

    assert _decode_json_object(value) == {"tts": {"enabled": True}}


def test_decode_json_object_falls_back_for_invalid_payloads():
    fallback = {"safe": True}

    assert _decode_json_object("not-json", default=fallback) == fallback
    assert _decode_json_object(None, default=fallback) == fallback
