/**
 * Validate presigned URL request parameters
 */
exports.validatePresignedUrlRequest = (data) => {
    const { fileName, fileType, fileSize } = data;

    if (!fileName || typeof fileName !== 'string' || fileName.trim().length === 0) {
        return { isValid: false, error: 'fileName is required and must be a non-empty string' };
    }

    if (fileType && typeof fileType !== 'string') {
        return { isValid: false, error: 'fileType must be a string' };
    }

    if (fileSize && (!Number.isInteger(fileSize) || fileSize <= 0)) {
        return { isValid: false, error: 'fileSize must be a positive integer' };
    }

    const MAX_FILE_SIZE = 100 * 1024 * 1024;
    if (fileSize && fileSize > MAX_FILE_SIZE) {
        return { isValid: false, error: `File size cannot exceed ${MAX_FILE_SIZE / (1024 * 1024)}MB` };
    }

    const allowedExtensions = ['.mp3', '.wav', '.m4a'];
    const fileExtension = '.' + fileName.split('.').pop().toLowerCase();

    if (!allowedExtensions.includes(fileExtension)) {
        return {
            isValid: false,
            error: `File type not supported. Allowed: ${allowedExtensions.join(', ')}`
        };
    }

    return { isValid: true };
};
