
export const uploadHandler = async (event) => {

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: ''
        };
    }

    return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
            message: 'Upload handler working with ES modules!',
            timestamp: new Date().toISOString(),
            httpMethod: event.httpMethod,
            environment: process.env.AUDIO_BUCKET
        })
    };
};