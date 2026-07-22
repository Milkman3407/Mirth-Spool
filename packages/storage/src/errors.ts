export type MediaCacheErrorCode =
  | "MEDIA_ABORTED"
  | "MEDIA_ACTIVE_CONTENT"
  | "MEDIA_ADDRESS_REJECTED"
  | "MEDIA_CONTENT_TYPE_MISMATCH"
  | "MEDIA_CONTENT_TYPE_UNSUPPORTED"
  | "MEDIA_DNS_FAILED"
  | "MEDIA_ENCODING_UNSUPPORTED"
  | "MEDIA_FETCH_FAILED"
  | "MEDIA_NOT_FOUND"
  | "MEDIA_QUOTA_EXCEEDED"
  | "MEDIA_REDIRECT_INVALID"
  | "MEDIA_REDIRECT_LIMIT"
  | "MEDIA_RESPONSE_TOO_LARGE"
  | "MEDIA_RESPONSE_TIMEOUT"
  | "MEDIA_STORAGE_FAILED"
  | "MEDIA_STORAGE_KEY_INVALID"
  | "MEDIA_URL_REJECTED";

export class MediaCacheError extends Error {
  constructor(
    readonly code: MediaCacheErrorCode,
    readonly retryable = false,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "MediaCacheError";
  }
}
