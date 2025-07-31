/**
 * Binary content detection utility for HttpCraft
 * Determines whether HTTP response content should be treated as binary or text
 */

export class BinaryDetector {
  private static readonly BINARY_MIME_TYPES = [
    // Archives
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/gzip',
    'application/x-tar',
    'application/x-bzip2',
    'application/x-xz',
    'application/vnd.apple.pkpass',

    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',

    // Images - using startsWith for all image types
    'image/',

    // Audio/Video - using startsWith for all media types
    'audio/',
    'video/',

    // Fonts
    'font/',
    'application/font-woff',
    'application/font-woff2',
    'application/vnd.ms-fontobject',
    'application/x-font-ttf',

    // Generic binary
    'application/octet-stream',
    'application/binary',

    // Executables
    'application/x-executable',
    'application/x-msdos-program',
    'application/x-msdownload',

    // Database files
    'application/x-sqlite3',
    'application/vnd.sqlite3',
  ];

  /**
   * Determines if a Content-Type header indicates binary content
   */
  static isBinaryContentType(contentType: string): boolean {
    if (!contentType) return false;

    // Normalize content type (remove charset and other parameters)
    const normalized = contentType.toLowerCase().split(';')[0].trim();

    return this.BINARY_MIME_TYPES.some((type) => {
      if (type.endsWith('/')) {
        // For types like 'image/', 'audio/', 'video/' - check if it starts with the type
        return normalized.startsWith(type);
      } else {
        // For specific types, exact match
        return normalized === type;
      }
    });
  }

  /**
   * Comprehensive binary content detection using multiple heuristics
   */
  static shouldTreatAsBinary(headers: Record<string, string>, data: unknown): boolean {
    // Get content type (case-insensitive header lookup)
    const contentType = this.getHeaderCaseInsensitive(headers, 'content-type');

    // Primary detection: Content-Type header
    if (contentType && this.isBinaryContentType(contentType)) {
      return true;
    }

    // Secondary detection: Content-Disposition with attachment
    const disposition = this.getHeaderCaseInsensitive(headers, 'content-disposition');
    if (disposition && disposition.toLowerCase().includes('attachment')) {
      // Content-Disposition: attachment often indicates downloadable binary files
      return true;
    }

    // If we have a content-type header that explicitly indicates text, trust it
    if (contentType) {
      const normalized = contentType.toLowerCase().split(';')[0].trim();
      if (
        normalized.startsWith('text/') ||
        normalized === 'application/json' ||
        normalized === 'application/xml' ||
        normalized === 'application/javascript' ||
        normalized === 'application/x-javascript' ||
        normalized.includes('xml') ||
        normalized.includes('json')
      ) {
        return false;
      }
    }

    // Tertiary detection: Data structure analysis (only when no content-type guidance)
    if (!contentType) {
      if (Buffer.isBuffer(data)) {
        return true;
      }

      // Handle axios ArrayBuffer responses (only when no content-type header)
      if (data instanceof ArrayBuffer) {
        return true;
      }
    }

    // Default to text for unknown types
    return false;
  }

  /**
   * Case-insensitive header lookup
   */
  private static getHeaderCaseInsensitive(
    headers: Record<string, string>,
    headerName: string
  ): string | undefined {
    const lowerHeaderName = headerName.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === lowerHeaderName) {
        return value;
      }
    }
    return undefined;
  }

  /**
   * Detect text encoding from Content-Type header
   */
  static detectTextEncoding(
    contentType?: string
  ): 'utf8' | 'latin1' | 'ascii' | 'utf16le' | 'base64' | 'hex' {
    if (!contentType) return 'utf8';

    const charsetMatch = contentType.match(/charset=([^;]+)/i);
    if (charsetMatch) {
      const charset = charsetMatch[1].toLowerCase().trim();

      // Map common charset names to Node.js buffer encodings
      switch (charset) {
        case 'utf-8':
        case 'utf8':
          return 'utf8';
        case 'iso-8859-1':
        case 'latin1':
          return 'latin1';
        case 'ascii':
          return 'ascii';
        case 'utf-16le':
        case 'utf16le':
          return 'utf16le';
        case 'base64':
          return 'base64';
        case 'hex':
          return 'hex';
        default:
          // Default to utf8 for unknown charsets
          return 'utf8';
      }
    }

    return 'utf8';
  }

  /**
   * Get human-readable size string for binary data
   */
  static formatSize(bytes: number): string {
    if (bytes === 0) return '0 bytes';

    const sizes = ['bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));

    if (i === 0) return `${bytes} ${sizes[i]}`;

    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }
}
