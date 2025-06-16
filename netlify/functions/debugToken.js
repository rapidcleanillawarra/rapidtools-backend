const { db } = require('./utils/firebaseInit');

exports.handler = async function(event, context) {
  try {
    const tenantId = event.queryStringParameters?.tenant_id;
    
    if (!tenantId) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          success: false,
          error: 'Missing tenant_id parameter',
          message: 'Please provide tenant_id as a query parameter'
        }, null, 2)
      };
    }

    // Get token data from Firestore
    const doc = await db.collection('xero_tokens').doc(tenantId).get();
    
    if (!doc.exists) {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error: 'No token found for this tenant ID',
          tenantId: tenantId,
          suggestion: 'Complete OAuth flow first'
        }, null, 2)
      };
    }

    const tokenData = doc.data();
    const expiresAtTime = tokenData.expiresAt.toDate ? tokenData.expiresAt.toDate().getTime() : tokenData.expiresAt.getTime();
    const now = Date.now();
    const isExpired = now > expiresAtTime;
    const expiresInMinutes = Math.round((expiresAtTime - now) / 60000);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        tenantId: tenantId,
        tokenInfo: {
          tenantName: tokenData.tenantName,
          hasAccessToken: !!tokenData.accessToken,
          hasRefreshToken: !!tokenData.refreshToken,
          accessTokenPreview: tokenData.accessToken ? tokenData.accessToken.substring(0, 20) + '...' : null,
          expiresAt: tokenData.expiresAt,
          isExpired: isExpired,
          expiresInMinutes: expiresInMinutes,
          updatedAt: tokenData.updatedAt
        },
        debug: {
          currentTime: new Date().toISOString(),
          expiresAtTime: new Date(expiresAtTime).toISOString(),
          timeDifference: `${expiresInMinutes} minutes`
        }
      }, null, 2)
    };

  } catch (error) {
    console.error('Debug token error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: 'Failed to debug token',
        details: error.message
      }, null, 2)
    };
  }
}; 