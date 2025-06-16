// This function handles the OAuth2 callback from Xero after user authorization
// It exchanges the authorization code for access tokens and returns success

const { XeroClient } = require('xero-node');

exports.handler = async function(event, context) {
  // Verify we received an authorization code
  const code = event.queryStringParameters.code;
  if (!code) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'No authorization code received' })
    };
  }

  try {
    // Initialize the Xero client with the same configuration as in auth.js
    const xero = new XeroClient({
      clientId: process.env.XERO_CLIENT_ID,
      clientSecret: process.env.XERO_CLIENT_SECRET,
      redirectUris: [process.env.XERO_REDIRECT_URI],
      scopes: process.env.XERO_SCOPES.split(' ')
    });
    
    // Exchange the authorization code for access tokens
    const tokenSet = await xero.apiCallback(code);
    
    // Log token info for debugging (remove in production)
    console.log('Token exchange successful:', {
      hasAccessToken: !!tokenSet.access_token,
      hasRefreshToken: !!tokenSet.refresh_token,
      expiresAt: tokenSet.expires_at
    });
    
    // NOTE: In production, you should store tokens in a secure database
    // For now, we'll just confirm the OAuth flow worked
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html'
      },
      body: `
        <html>
          <body>
            <h1>Successfully connected to Xero!</h1>
            <p>OAuth flow completed successfully.</p>
            <p>Token received and validated.</p>
            <p>You can close this window and return to the application.</p>
            <script>
              // Optional: Close window automatically after 3 seconds
              setTimeout(() => window.close(), 3000);
            </script>
          </body>
        </html>
      `
    };
  } catch (error) {
    console.error('Callback error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to process authorization callback',
        details: error.message 
      })
    };
  }
}; 