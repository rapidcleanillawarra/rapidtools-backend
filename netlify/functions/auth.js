// This function initiates the Xero OAuth2 flow by redirecting the user to Xero's authorization page

const { XeroClient } = require('xero-node');

exports.handler = async function(event, context) {
  try {
    // Validate environment variables
    const clientId = process.env.XERO_CLIENT_ID;
    const redirectUri = process.env.XERO_REDIRECT_URI;
    const scopes = process.env.XERO_SCOPES;

    if (!clientId || !redirectUri || !scopes) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Missing Xero configuration',
          details: 'XERO_CLIENT_ID, XERO_REDIRECT_URI, and XERO_SCOPES must be set'
        })
      };
    }

    // Generate state parameter for security
    const state = Math.random().toString(36).substring(2, 15);
    
    // Build Xero OAuth URL
    const authUrl = new URL('https://login.xero.com/identity/connect/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('state', state);

    console.log('Redirecting to Xero OAuth:', {
      clientId,
      redirectUri,
      scopes,
      state
    });

    // Redirect to Xero OAuth
    return {
      statusCode: 302,
      headers: {
        'Location': authUrl.toString(),
        'Cache-Control': 'no-cache'
      },
      body: ''
    };

  } catch (error) {
    console.error('Auth endpoint error:', error);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to initiate OAuth flow',
        details: error.message
      })
    };
  }
}; 