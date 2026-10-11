"""Unit tests for CSV normalization helpers that do not require a live database."""

import os

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "rohly_test")

from routers.csv_campaigns import clean_row


def test_clean_row_preserves_columns_and_replaces_missing_values():
    columns = ["Email", "Company", "Title"]

    result = clean_row(
        {"Email": "person@example.com", "Company": None},
        columns,
    )

    assert result == {
        "Email": "person@example.com",
        "Company": "",
        "Title": "",
    }


def test_clean_row_does_not_leak_unrequested_columns():
    result = clean_row(
        {"Email": "person@example.com", "PrivateNote": "not imported"},
        ["Email"],
    )

    assert result == {"Email": "person@example.com"}
