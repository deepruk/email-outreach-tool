from routers.open_tracking import html_body


def test_open_tracking_pixel_and_unsubscribe_are_included(monkeypatch):
    monkeypatch.setenv("APP_URL", "https://rohly.example")
    result = html_body("Hi <Asha>\nWelcome", "tracking-123", True, False, True)

    assert "Hi &lt;Asha&gt;<br>" in result
    assert 'src="https://rohly.example/api/track/open/tracking-123"' in result
    assert 'href="https://rohly.example/api/track/unsubscribe/tracking-123"' in result


def test_open_tracking_pixel_can_be_disabled(monkeypatch):
    monkeypatch.setenv("APP_URL", "https://rohly.example")
    result = html_body("Hello", "tracking-456", False, False, False)

    assert "/api/track/open/" not in result
    assert "/api/track/unsubscribe/" not in result


def test_click_tracking_wraps_links_only_when_enabled(monkeypatch):
    monkeypatch.setenv("APP_URL", "https://rohly.example")
    tracked = html_body("Visit https://example.com/path", "tracking-789", False, True, False)
    untracked = html_body("Visit https://example.com/path", "tracking-789", False, False, False)

    assert "/api/track/click/tracking-789/1" in tracked
    assert "url=https%3A%2F%2Fexample.com%2Fpath" in tracked
    assert 'href="https://example.com/path"' in untracked
