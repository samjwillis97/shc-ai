# Binary Data Handling in HttpCraft

HttpCraft now supports complete binary data handling without corruption, enabling proper downloading of files like ZIP archives, images, PDFs, and other binary content through shell redirection.

## Overview

Prior to Phase 16, HttpCraft would corrupt binary data by forcing all HTTP response bodies through `JSON.stringify()`. This has been completely fixed with a comprehensive binary data handling system.

## Key Features

- **Automatic Binary Detection**: Detects binary content based on Content-Type headers
- **Data Integrity**: Preserves byte-for-byte accuracy for binary files
- **Shell Redirection Support**: Works seamlessly with Unix shell patterns like `> file.zip`
- **Plugin Compatibility**: Plugins handle binary data gracefully
- **Chain Support**: Binary data works correctly in chain execution
- **Verbose Mode**: Shows binary metadata instead of corrupting terminal output

## How It Works

### 1. Content-Type Detection

HttpCraft automatically detects binary content using multiple methods:

```typescript
// Primary: Content-Type header analysis
'application/zip'; // ZIP archives
'application/pdf'; // PDF documents
'image/*'; // All image types
'audio/*'; // All audio types
'video/*'; // All video types
'application/octet-stream'; // Generic binary

// Fallback: Content-Disposition analysis
'Content-Disposition: attachment; filename="file.zip"';

// Ultimate fallback: Data structure analysis
Buffer.isBuffer(data) || data instanceof ArrayBuffer;
```

### 2. Response Processing

The HttpClient now:

1. Requests all data as `ArrayBuffer` from axios
2. Analyzes headers to determine if response is binary
3. Preserves binary data as `Buffer` or converts to string with proper encoding
4. Sets metadata flags (`isBinary`, `contentType`, `contentLength`)

### 3. Output Handling

Different output methods handle binary data appropriately:

```typescript
// API command output
if (response.isBinary && Buffer.isBuffer(response.body)) {
  process.stdout.write(response.body); // Raw binary to stdout
} else {
  console.log(response.body as string); // Text output
}
```

## Usage Examples

### Basic File Downloads

```bash
# Download a ZIP file
httpcraft fileapi download --var fileId=123 > backup.zip

# Download an image
httpcraft imageapi thumbnail --var imageId=456 > thumbnail.jpg

# Download a PDF document
httpcraft docapi export --var docId=789 > document.pdf
```

### Using with Chains

```yaml
chains:
  downloadWorkflow:
    steps:
      - id: generateReport
        call: reportapi.generate
      - id: downloadPdf
        call: reportapi.downloadPdf
        with:
          pathParams:
            reportId: '{{steps.generateReport.response.body.reportId}}'
# Usage:
# httpcraft chain downloadWorkflow > report.pdf
```

### Verbose Mode with Binary Data

```bash
httpcraft fileapi download --var fileId=123 --verbose > file.zip

# Output to stderr:
# [RESPONSE] 200 OK (1234ms)
# [RESPONSE] Binary Content-Type: application/zip
# [RESPONSE] Content-Length: 2048576 bytes
```

## Supported Binary File Types

HttpCraft recognizes these binary content types:

### Archives

- `application/zip` - ZIP archives
- `application/x-rar-compressed` - RAR archives
- `application/gzip` - GZIP compressed files
- `application/x-tar` - TAR archives

### Documents

- `application/pdf` - PDF documents
- `application/msword` - Word documents
- `application/vnd.openxmlformats-officedocument.*` - Office documents

### Media Files

- `image/*` - All image formats (PNG, JPEG, GIF, etc.)
- `audio/*` - All audio formats (MP3, WAV, etc.)
- `video/*` - All video formats (MP4, AVI, etc.)

### Fonts

- `font/*` - Font files
- `application/font-woff` - WOFF fonts

### Generic Binary

- `application/octet-stream` - Generic binary data
- `application/binary` - Binary data

## Configuration Examples

### Basic Binary Download API

```yaml
apis:
  fileAPI:
    baseUrl: 'https://api.example.com'
    endpoints:
      download:
        path: '/files/{{fileId}}/download'
        method: GET
        headers:
          Authorization: 'Bearer {{secret.API_TOKEN}}'
          Accept: 'application/octet-stream'
# Usage: httpcraft fileAPI download --var fileId=123 > file.dat
```

### Image Processing API

```yaml
apis:
  imageAPI:
    baseUrl: 'https://images.example.com'
    endpoints:
      resize:
        path: '/resize'
        method: POST
        headers:
          Content-Type: 'application/json'
        body:
          imageUrl: '{{imageUrl}}'
          width: '{{width}}'
          height: '{{height}}'

      download:
        path: '/processed/{{imageId}}'
        method: GET
        headers:
          Accept: 'image/png'

chains:
  processImage:
    steps:
      - id: resize
        call: imageAPI.resize
      - id: download
        call: imageAPI.download
        with:
          pathParams:
            imageId: '{{steps.resize.response.body.imageId}}'
# Usage: httpcraft chain processImage --var imageUrl=... > processed.png
```

## Plugin Development with Binary Data

When developing plugins that work with binary data:

### Check for Binary Responses

```javascript
export default {
  setup(context) {
    context.registerPostResponseHook(async (request, response) => {
      // Always check if response is binary first
      if (response.isBinary) {
        console.log(`Binary response: ${response.contentType}, ${response.contentLength} bytes`);
        return; // Skip text processing
      }

      // Safe to process as text
      const textData = response.body;
      // ... process text data
    });
  },
};
```

### Handle Binary Data Appropriately

```javascript
context.registerPostResponseHook(async (request, response) => {
  if (response.isBinary) {
    // For binary data, you might:
    // - Log metadata
    // - Validate file signatures
    // - Extract headers/metadata
    // - But avoid trying to parse as JSON/XML

    if (response.contentType === 'application/zip') {
      console.log('ZIP file downloaded successfully');
    }
    return;
  }

  // Process text responses normally
  if (response.contentType?.includes('json')) {
    const data = JSON.parse(response.body);
    // ... process JSON
  }
});
```

## Chain Execution with Binary Data

### Default Output (Last Step)

When a chain's last step returns binary data:

```bash
httpcraft chain downloadWorkflow > output.pdf
# Binary data from last step written directly to file
```

### Structured JSON Output

With `--chain-output full`, binary data is represented as metadata:

```bash
httpcraft chain downloadWorkflow --chain-output full
```

```json
{
  "chainName": "downloadWorkflow",
  "success": true,
  "steps": [
    {
      "stepId": "downloadPdf",
      "response": {
        "status": 200,
        "body": "<BINARY_DATA:application/pdf:2048576_bytes>",
        "isBinary": true,
        "contentType": "application/pdf"
      }
    }
  ]
}
```

## Variable Resolution and Binary Data

Binary response bodies cannot be used in template variables:

```yaml
# This will cause an error:
chains:
  invalidChain:
    steps:
      - id: download
        call: fileapi.downloadBinary
      - id: process
        call: processapi.analyze
        with:
          body:
            data: '{{steps.download.response.body}}' # ERROR: Binary data!
```

Instead, use metadata:

```yaml
chains:
  validChain:
    steps:
      - id: download
        call: fileapi.downloadBinary
      - id: process
        call: processapi.analyze
        with:
          body:
            contentType: '{{steps.download.response.contentType}}'
            size: '{{steps.download.response.contentLength}}'
```

## Troubleshooting

### File Corruption Issues

If downloaded files are corrupted:

1. **Check Content-Type**: Ensure the API returns correct Content-Type headers
2. **Verify Binary Detection**: Use `--verbose` to see if HttpCraft detects the response as binary
3. **Test with Small Files**: Start with small binary files to isolate issues

### Terminal Display Issues

If binary data appears in terminal:

1. **Use Shell Redirection**: Always redirect binary output to files
2. **Check Chain Output**: Use `--chain-output full` for debugging
3. **Use Verbose Mode**: Binary data is safely displayed as metadata in verbose mode

### Plugin Compatibility

If plugins fail with binary data:

1. **Update Plugin Logic**: Add binary data checks in plugin hooks
2. **Skip Binary Processing**: Return early from hooks when `response.isBinary` is true
3. **Handle Gracefully**: Design plugins to work with both text and binary responses

## Technical Implementation

### Enhanced HttpResponse Interface

```typescript
interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string | Buffer; // Support both types
  isBinary: boolean; // Detection flag
  contentType?: string; // Original Content-Type
  contentLength?: number; // Size information
}
```

### Binary Detection Logic

```typescript
class BinaryDetector {
  static shouldTreatAsBinary(headers: Record<string, string>, data: unknown): boolean {
    // 1. Content-Type analysis
    const contentType = headers['content-type'];
    if (contentType && this.isBinaryContentType(contentType)) {
      return true;
    }

    // 2. Content-Disposition analysis
    const disposition = headers['content-disposition'];
    if (disposition && disposition.includes('attachment')) {
      return true;
    }

    // 3. Data structure analysis
    if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
      return true;
    }

    return false;
  }
}
```

## Best Practices

1. **Always Use Shell Redirection for Binary Data**

   ```bash
   httpcraft api download > file.zip  # ✅ Correct
   httpcraft api download             # ❌ May corrupt terminal
   ```

2. **Use Verbose Mode for Debugging**

   ```bash
   httpcraft api download --verbose > file.zip 2> debug.log
   ```

3. **Design APIs with Proper Content-Type Headers**

   ```yaml
   endpoints:
     download:
       headers:
         Accept: 'application/octet-stream' # Request binary explicitly
   ```

4. **Test Binary Downloads with Known Files**

   ```bash
   # Download a known file and verify checksums
   httpcraft api download > test.zip
   sha256sum test.zip  # Compare with expected hash
   ```

5. **Handle Binary Data in Plugins Gracefully**
   ```javascript
   if (response.isBinary) {
     // Process metadata only
     return;
   }
   // Process text content
   ```

This comprehensive binary data handling ensures HttpCraft works seamlessly with all types of HTTP APIs, from text-based JSON APIs to file download services, while maintaining data integrity and providing excellent developer experience.
