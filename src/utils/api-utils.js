const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type': 'application/json'
}

const createResponse = (statusCode, bodyObj = {}) => ({
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(bodyObj)
})

const createErrorResponse = (statusCode, message, details = {}) =>
    createResponse(statusCode, {
        error: message,
        ...details
    });

const createOptionsResponse = () => ({
    statusCode: 200,
    headers: corsHeaders,
    body: ''
});

const parseRequestBody = (body) => {
    if (!body) {
        return {};
    }

    try {
        return JSON.parse(body);
    } catch (parseError) {
        throw new Error(`Invalid JSON in request body: ${parseError.message}`);
    }
};

module.exports = {
    createResponse,
    createErrorResponse,
    createOptionsResponse,
    parseRequestBody
};