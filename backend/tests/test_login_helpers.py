from app.main import _build_login_payload, _extract_token, _remote_error_detail


def test_extract_token_from_nested_result_token():
    data = {"code": 2000, "result": {"token": "abc123"}}

    assert _extract_token(data) == "abc123"


def test_extract_token_accepts_common_token_field_names():
    assert _extract_token({"result": {"authtoken": "auth-value"}}) == "auth-value"
    assert _extract_token({"access_token": "access-value"}) == "access-value"


def test_build_login_payload_matches_remote_frontend_contract():
    payload = _build_login_payload(
        username="demo",
        password="secret",
        code="A1B2",
        uuid="uuid-value",
    )

    assert payload == {
        "identifierCode": "pc",
        "uuid": "uuid-value",
        "userInfo": {
            "username": "demo",
            "pwd": "5ebe2294ecd0e0f08eab7690d2a6ee69",
        },
        "kaptcha": "A1B2",
    }


def test_remote_error_detail_includes_remote_result():
    detail = _remote_error_detail(
        {"code": 5001, "message": "验证码错误", "success": False, "result": {"left": 2}},
        "登录失败",
    )

    assert detail == {
        "message": "验证码错误",
        "remote": {
            "code": 5001,
            "message": "验证码错误",
            "success": False,
            "result": {"left": 2},
        },
    }
