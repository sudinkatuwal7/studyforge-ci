"""Safe errors scoped to document endpoints, not other domains."""

from rest_framework.exceptions import APIException


MESSAGES = {
    "INVALID_MATERIAL_UPDATE": "Provide only the name field as JSON.",
    "INVALID_NAME": "Use a name of 1 to 255 characters without control characters.",
    "MATERIAL_UNAVAILABLE": "The material request could not be completed. Please try again later.",
    "AUTHENTICATION_REQUIRED": "Authentication is required.",
    "RESOURCE_NOT_FOUND": "Resource not found.",
    "FILE_REQUIRED": "Choose a PDF, DOCX, or PPTX file to upload.",
    "EMPTY_FILE": "The uploaded file is empty.",
    "INVALID_UPLOAD": "Upload exactly one file using the file field and no other fields.",
    "INVALID_REQUEST": "The upload request is malformed.",
    "UNSUPPORTED_MEDIA_TYPE": "Use multipart/form-data to upload a document.",
    "INVALID_FORMAT": "Choose a PDF, DOCX, or PPTX file.",
    "INVALID_OFFICE": "Upload a valid, readable DOCX or PPTX file.",
    "INVALID_PDF": "Upload a valid, readable PDF.",
    "UNSUPPORTED_PDF": "Encrypted PDFs are not supported.",
    "FILE_TOO_LARGE": "The file must be no larger than 20 MiB.",
    "UPLOAD_UNAVAILABLE": "The document could not be saved. Please try again later.",
    "PROCESSING_FAILED": "This document could not be processed.",
    "PROCESSING_DISPATCH_FAILED": "The document was saved, but processing could not be started.",
    "PROCESSING_HANDOFF_UNCONFIRMED": (
        "The document was saved, but processing could not be confirmed. "
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
