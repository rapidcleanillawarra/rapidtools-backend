const { XeroClient } = require('xero-node');

exports.handler = async function(event, context) {
  // Validate incoming request
  if (!event.queryStringParameters?.code) {
    console.error('Missing authorization code in request:', {
      query: event.queryStringParameters,
      headers: event.headers
    });
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Authorization code missing from callback URL' })
    };
  }

  const code = event.queryStringParameters.code;
  const state = event.queryStringParameters.state || 'no_state_provided';

  try {
    // Validate environment variables
    const requiredVars = {
      XERO_CLIENT_ID: process.env.XERO_CLIENT_ID,
      XERO_CLIENT_SECRET: process.env.XERO_CLIENT_SECRET,
      XERO_REDIRECT_URI: process.env.XERO_REDIRECT_URI,
      XERO_SCOPES: process.env.XERO_SCOPES
    };

    const missingVars = Object.entries(requiredVars)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    if (missingVars.length > 0) {
      throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
    }

    console.log('Initializing Xero client with configuration:', {
      clientId: requiredVars.XERO_CLIENT_ID,
      clientSecret: requiredVars.XERO_CLIENT_SECRET?.replace(/./g, '*'), // Masked for logs
      redirectUri: requiredVars.XERO_REDIRECT_URI,
      scopes: requiredVars.XERO_SCOPES,
      state
    });

    const xero = new XeroClient({
      clientId: requiredVars.XERO_CLIENT_ID,
      clientSecret: requiredVars.XERO_CLIENT_SECRET,
      redirectUris: [requiredVars.XERO_REDIRECT_URI],
      scopes: requiredVars.XERO_SCOPES.split(' ')
    });

    console.log('Exchanging authorization code for tokens...');
    const tokenSet = await xero.apiCallback(code);
    
    if (!tokenSet.access_token) {
      throw new Error('Token exchange succeeded but no access token was returned');
    }

    console.log('Token exchange successful. Token details:', {
      access_token: tokenSet.access_token?.substring(0, 10) + '...', // Partial for security
      refresh_token: !!tokenSet.refresh_token,
      expires_at: new Date(tokenSet.expires_at * 1000).toISOString(),
      tenant_id: tokenSet.tenant_id
    });

    // For production: Store tokens in database here
    // Temporary solution for testing:
    const successHtml = `
      <html>
        <head>
          <title>Xero Connection Successful</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 2rem; }
            .success { color: #2ecc71; }
            .info { color: #3498db; margin-top: 1rem; }
          </style>
        </head>
        <body>
          <h1 class="success">✓ Xero Connection Successful</h1>
          <div class="info">
            <p>You can now close this window and return to the application.</p>
            <p>Token expires: ${new Date(tokenSet.expires_at * 1000).toLocaleString()}</p>
          </div>
          <script>
            // Auto-close after 3 seconds
            setTimeout(() => window.close(), 3000);
            // Send success message to opener if available
            if (window.opener) {
              window.opener.postMessage('xero-auth-success', '*');
            }
          </script>
        </body>
      </html>
    `;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: successHtml
    };

  } catch (error) {
    console.error('Xero Callback Error:', {
      message: error.message,
      stack: error.stack,
      code,
      state,
      env: {
        clientId: !!process.env.XERO_CLIENT_ID,
        clientSecret: !!process.env.XERO_CLIENT_SECRET,
        redirectUri: process.env.XERO_REDIRECT_URI,
        scopes: process.env.XERO_SCOPES
      }
    });

    const errorHtml = `
      <html>
        <head>
          <title>Xero Connection Failed</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 2rem; }
            .error { color: #e74c3c; }
            .details { 
              background: #f8f9fa; 
              padding: 1rem; 
              margin: 1rem auto; 
              max-width: 600px;
              text-align: left;
              font-family: monospace;
            }
          </style>
        </head>
        <body>
          <h1 class="error">✗ Xero Connection Failed</h1>
          <div class="details">
            <p><strong>Error:</strong> ${error.message}</p>
            <p><strong>Code:</strong> ${code}</p>
            <p><strong>State:</strong> ${state}</p>
            <p>Please check the Netlify function logs for details.</p>
          </div>
          <button onclick="window.close()">Close Window</button>
        </body>
      </html>
    `;

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: errorHtml
    };
  }
};