"""In-memory stand-ins for Person 3's Document interface."""

from __future__ import annotations

from io import BytesIO


class FakeFile:
    def __init__(self, data: bytes = b"%PDF-1.4 fake"):
        self._data = data

    def open(self, mode: str = "rb"):
        return BytesIO(self._data)


class FakeDocument:
    class Status:
        PENDING = "PENDING"
        PROCESSING = "PROCESSING"
        READY = "READY"
        FAILED = "FAILED"

    DoesNotExist = type("DoesNotExist", (Exception,), {})

    def __init__(
        self,
        pk: int = 42,
        status: str = "PENDING",
        file: FakeFile | None = None,
        *,
        with_optional_fields: bool = False,
    ):
        self.pk = pk
        self.status = status
        self.file = FakeFile() if file is None else file
        self.save_calls: list[str] = []
        if with_optional_fields:
            self.extracted_text = ""
            self.page_count = 0
            self.error_code = None
            self.error_message = ""

    def save(self, update_fields=None):
        self.save_calls.append(self.status)
