/**
 * Proxy B2 private bucket objects so the browser loads them same-origin (avoids ORB/CORS).
 * GET /.netlify/functions/b2-image?key=<base64url-encoded-object-key>
 */

const { getB2Client } = require('./utils/b2Presigned');
const { GetObjectCommand } = require('@aws-sdk/client-s3');

const BUCKET = process.env.B2_BUCKET_NAME;

function base64UrlDecode(str) {
    try {
        return Buffer.from(str, 'base64url').toString('utf8');
    } catch {
        return null;
    }
}

const EXT_TO_TYPE = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    pdf: 'application/pdf'
};

function contentTypeFromKey(key) {
    const ext = key.split('.').pop()?.toLowerCase();
    return EXT_TO_TYPE[ext] || 'application/octet-stream';
}

const handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'private, max-age=3600'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const keyEnc = event.queryStringParameters?.key;
    if (!keyEnc) {
        return { statusCode: 400, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing key' }) };
    }

    const key = base64UrlDecode(keyEnc);
    if (!key || key.includes('..')) {
        return { statusCode: 400, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid key' }) };
    }

    const client = getB2Client();
    if (!client || !BUCKET) {
        return { statusCode: 503, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'B2 not configured' }) };
    }

    try {
        const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
        const response = await client.send(command);
        const body = await response.Body.transformToByteArray();
        const contentType = response.ContentType || contentTypeFromKey(key);

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': contentType,
                'Content-Length': String(body.length)
            },
            body: body.toString('base64'),
            isBase64Encoded: true
        };
    } catch (err) {
        console.error('b2-image proxy error:', key, err?.message || err);
        const code = err?.name === 'NoSuchKey' ? 404 : 502;
        return {
            statusCode: code,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: code === 404 ? 'Not Found' : 'Bad Gateway' })
        };
    }
};

module.exports = { handler };
