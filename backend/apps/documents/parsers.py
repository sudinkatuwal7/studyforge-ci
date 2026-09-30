"""Require complete multipart framing while retaining Django's streaming parser."""

from django.utils.http import parse_header_parameters
from rest_framework.exceptions import ParseError
from rest_framework.parsers import MultiPartParser


class _BoundaryStream:
    def __init__(self, stream, boundary):
        self.stream = stream
        self.marker = b"\r\n--" + boundary + b"--"
        self.tail = b"\r\n"
        self.complete = False

    def read(self, size=-1):
        data = self.stream.read(size)
        combined = self.tail + data
        if self.marker + b"\r\n" in combined or (not data and combined.endswith(self.marker)):
            self.complete = True
        self.tail = combined[-(len(self.marker) + 2):]
        return data

    def __iter__(self):
        return self

    def __next__(self):
        data = self.read(64 * 1024)
        if not data:
            raise StopIteration
        return data


class DocumentMultipartParser(MultiPartParser):
    def parse(self, stream, media_type=None, parser_context=None):
        _, parameters = parse_header_parameters(media_type or "")
        boundary = parameters.get("boundary", "")
        if not boundary or not boundary.isascii() or len(boundary) > 200:
            raise ParseError()
        checked = _BoundaryStream(stream, boundary.encode("ascii"))
        result = super().parse(checked, media_type, parser_context)
        if not checked.complete:
            for files in result.files.lists():
                for upload in files[1]:
                    upload.close()
            raise ParseError()
        return result
