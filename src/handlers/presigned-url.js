const {createResponse, createErrorResponse, createOptionsResponse} = require('../utils/api-utils.js');
const {generatePresignedUrl} = require('../services/s3-service.js');
const {validatePresignedUrlRequest} = require('../utils/validation-utils.js');

exports.presignedUrlHandler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return createOptionsResponse();
    }

    try {
        const requestData = parseRequestBody(event.body);
        const validationResult = validatePresignedUrlRequest(requestData);

        if (!validationResult.isValid) {
            return createErrorResponse(400, validationResult.error);
        }
        const result = await generatePresignedUrl(requestData);

        return createResponse(200, result);

    } catch (error) {
        console.error('Error generating presigned URL:', {
            error: error.message,
            stack: error.stack,
            requestId: event.requestContext?.requestId
        });

        return createErrorResponse(500, 'Internal server error');
    }
};

/**
 * Parse request body with error handling
 */
function parseRequestBody(body) {
    if (!body) {
        return {};
    }

    try {
        return JSON.parse(body);
    } catch (parseError) {
        throw new Error(`Invalid JSON in request body: ${parseError.message}`);
    }
}