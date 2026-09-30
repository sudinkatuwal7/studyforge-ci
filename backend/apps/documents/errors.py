"""Safe errors scoped to document endpoints, not other domains."""

from rest_framework.exceptions import APIException


MESSAGES = {
    "AUTHENTICATION_REQUIRED": "Authentication is required.",
    "RESOURCE_NOT_FOUND": "Resource not found.",
    "FILE_REQUIRED": "Choose a PDF to upload.",
    "EMPTY_FILE": "The uploaded file is empty.",
    "INVALID_UPLOAD": "Upload exactly one file using the file field and no other fields.",
    "INVALID_REQUEST": "The upload request is malformed.",
    "UNSUPPORTED_MEDIA_TYPE": "Use multipart/form-data to upload a PDF.",
    "INVALID_PDF": "Upload a valid, readable PDF.",
    "UNSUPPORTED_PDF": "Encrypted PDFs are not supported.",
    "FILE_TOO_LARGE": "The PDF must be no larger than 20 MiB.",
    "UPLOAD_UNAVAILABLE": "The PDF could not be saved. Please try again later.",
    "PROCESSING_FAILED": "This PDF could not be processed.",
    "PROCESSING_DISPATCH_FAILED": "The PDF was saved, but processing could not be started.",
    "PROCESSING_HANDOFF_UNCONFIRMED": (
        "The PDF was saved, but processing could not be confirmed. "
        "Check its status before uploading again."
    ),
}


def error_body(code):
    return {"code": code, "message": MESSAGES[code]}


class DocumentAPIError(APIException):
    def __init__(self, code, status_code=400, *, document_id=None):
        self.status_code = status_code
        # Keep integer IDs intact: APIException converts nested values to strings.
        self.body = error_body(code)
        if document_id is not None:
            self.body = {"document_id": document_id, "error": self.body}
        super().__init__(detail=MESSAGES[code], code=code)
