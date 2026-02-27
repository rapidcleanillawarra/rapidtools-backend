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

    try {
        // Construct the full B2 S3-style URL to use the existing signing utility
        // The utility handles the S3 client, bucket, and signing logic.
        const bucket = process.env.B2_BUCKET_NAME;
        const endpoint = process.env.B2_ENDPOINT; // e.g. s3.us-west-004.backblazeb2.com
        if (!bucket || !endpoint) throw new Error('B2 not configured');

        const b2Url = `https://${bucket}.${endpoint}/${key}`;
        const presignedUrl = await require('./utils/b2Presigned').getPresignedUrl(b2Url, 600); // 10 min expiry

        return {
            statusCode: 302,
            headers: {
                ...headers,
                'Location': presignedUrl,
                'Cache-Control': 'private, max-age=600'
            },
            body: ''
        };
    } catch (err) {
        console.error('b2-image proxy error:', key, err?.message || err);
        return {
            statusCode: 502,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Bad Gateway', message: err.message })
        };
    }
};

module.exports = { handler };
