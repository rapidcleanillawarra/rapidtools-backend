/**
 * Simple ping endpoint to verify functions are working
 */
const handler = async (event) => {
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            message: 'pong',
            timestamp: new Date().toISOString(),
            nodeVersion: process.version
        })
    };
};

module.exports = { handler };
