"""Shared citation excerpt matching rules."""


def normalize_excerpt(value):
    """Collapse formatting whitespace while preserving non-whitespace characters."""
    return " ".join(value.split())


def excerpt_matches(excerpt, content):
    """Return whether an excerpt occurs in content, ignoring whitespace layout."""
    return normalize_excerpt(excerpt) in normalize_excerpt(content)
