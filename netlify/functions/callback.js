const { XeroClient } = require('xero-node');
const { storeTokens } = require('./utils/tokenManager');

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

    console.log('Processing Xero OAuth callback:', {
      clientId: requiredVars.XERO_CLIENT_ID,
      redirectUri: requiredVars.XERO_REDIRECT_URI,
      scopes: requiredVars.XERO_SCOPES,
      state
    });

    // Use direct API call since SDK has bugs
    const tokenRequestBody = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: requiredVars.XERO_CLIENT_ID,
      client_secret: requiredVars.XERO_CLIENT_SECRET,
      code: code,
      redirect_uri: requiredVars.XERO_REDIRECT_URI
    });

    console.log('Exchanging authorization code for tokens...');
    const tokenResponse = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenRequestBody
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText} - ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      throw new Error(`Xero API Error: ${tokenData.error} - ${tokenData.error_description}`);
    }

    if (!tokenData.access_token) {
      throw new Error(`No access token in response: ${JSON.stringify(tokenData)}`);
    }

    console.log('Token exchange successful:', {
      access_token: tokenData.access_token.substring(0, 20) + '...',
      refresh_token: !!tokenData.refresh_token,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      scope: tokenData.scope
    });

    // Get tenant information using the access token
    console.log('Fetching tenant information...');
    const tenantsResponse = await fetch('https://api.xero.com/connections', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    let tenantInfo = null;
    if (tenantsResponse.ok) {
      const tenants = await tenantsResponse.json();
      tenantInfo = tenants[0]; // Get first tenant
      console.log('Tenant info retrieved:', {
        tenantId: tenantInfo?.tenantId,
        tenantName: tenantInfo?.tenantName,
        tenantType: tenantInfo?.tenantType
      });
    }

    // After getting tokenData and tenantInfo:
    await storeTokens('user123', tokenData, tenantInfo); // TODO: Replace 'user123' with actual user ID

    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));
    
    const successHtml = `
      <html>
        <head>
          <title>Xero Connection Successful</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              text-align: center; 
              padding: 2rem;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              min-height: 100vh;
              margin: 0;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .container {
              background: rgba(255,255,255,0.1);
              padding: 2rem;
              border-radius: 10px;
              backdrop-filter: blur(10px);
              max-width: 800px;
            }
            .success { color: #2ecc71; font-size: 3rem; margin-bottom: 1rem; }
            .info { margin-top: 1rem; }
            .details { 
              background: rgba(255,255,255,0.1); 
              padding: 1rem; 
              border-radius: 5px; 
              margin: 1rem 0;
            }
            .token-section {
              background: rgba(0,0,0,0.3);
              padding: 1rem;
              border-radius: 5px;
              margin: 1rem 0;
              text-align: left;
            }
            .token-display {
              background: rgba(0,0,0,0.5);
              padding: 10px;
              border-radius: 3px;
              font-family: monospace;
              font-size: 12px;
              word-break: break-all;
              margin: 10px 0;
              cursor: pointer;
              border: 1px solid rgba(255,255,255,0.3);
            }
            .copy-btn {
              background: #2ecc71;
              color: white;
              border: none;
              padding: 5px 10px;
              border-radius: 3px;
              cursor: pointer;
              font-size: 12px;
              margin-top: 5px;
            }
            .copy-btn:hover {
              background: #27ae60;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success">✓</div>
            <h1>Xero Connection Successful!</h1>
            <div class="details">
              <p><strong>Organization:</strong> ${tenantInfo?.tenantName || 'Connected'}</p>
              <p><strong>Tenant ID:</strong> ${tenantInfo?.tenantId || 'N/A'}</p>
              <p><strong>Token expires:</strong> ${expiresAt.toLocaleString()}</p>
              <p><strong>Scopes:</strong> ${tokenData.scope}</p>
            </div>
            <div class="token-section">
              <h3>Access Token (for testing):</h3>
              <div class="token-display" id="tokenDisplay" onclick="copyToken()">
                ${tokenData.access_token}
              </div>
              <button class="copy-btn" onclick="copyToken()">Copy Token</button>
              <p style="font-size: 12px; margin-top: 10px;">
                <strong>Note:</strong> Token is also logged to browser console. Click token or button to copy.
              </p>
            </div>
            <div class="info">
              <p>You can now close this window and return to the application.</p>
              <p>Your Xero integration is ready to use!</p>
            </div>
          </div>
          <script>
            // Log token to console
            const accessToken = '${tokenData.access_token}';
            const tenantId = '${tenantInfo?.tenantId || ''}';
            
            console.log('=== XERO ACCESS TOKEN ===');
            console.log('Access Token:', accessToken);
            console.log('Tenant ID:', tenantId);
            console.log('Expires At:', '${expiresAt.toISOString()}');
            console.log('Test URL:', \`/.netlify/functions/getInvoices?access_token=\${accessToken}\`);
            console.log('========================');
            
            // Copy token function
            function copyToken() {
              navigator.clipboard.writeText(accessToken).then(() => {
                const btn = document.querySelector('.copy-btn');
                const originalText = btn.textContent;
                btn.textContent = 'Copied!';
                btn.style.background = '#27ae60';
                setTimeout(() => {
                  btn.textContent = originalText;
                  btn.style.background = '#2ecc71';
                }, 2000);
              }).catch(err => {
                console.error('Failed to copy token:', err);
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = accessToken;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
              });
            }
            
            setTimeout(() => window.close(), 10000); // Extended to 10 seconds for token copying
            if (window.opener) {
              window.opener.postMessage({
                type: 'xero-auth-success',
                data: {
                  tenantId: '${tenantInfo?.tenantId || ''}',
                  tenantName: '${tenantInfo?.tenantName || ''}',
                  expiresAt: '${expiresAt.toISOString()}',
                  accessToken: accessToken
                }
              }, '*');
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
      state
    });

    const errorHtml = `
      <html>
        <head>
          <title>Xero Connection Failed</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              text-align: center; 
              padding: 2rem;
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
              min-height: 100vh;
              margin: 0;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .container {
              background: rgba(255,255,255,0.1);
              padding: 2rem;
              border-radius: 10px;
              backdrop-filter: blur(10px);
            }
            .error { color: #ff4757; font-size: 3rem; margin-bottom: 1rem; }
            .details { 
              background: rgba(255,255,255,0.1); 
              padding: 1rem; 
              border-radius: 5px; 
              margin: 1rem 0;
              text-align: left;
              font-family: monospace;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error">✗</div>
            <h1>Xero Connection Failed</h1>
            <div class="details">
              <p><strong>Error:</strong> ${error.message}</p>
              <p><strong>Code:</strong> ${code}</p>
              <p><strong>State:</strong> ${state}</p>
            </div>
            <button onclick="window.close()" style="padding: 10px 20px; background: #ff4757; color: white; border: none; border-radius: 5px; cursor: pointer;">Close Window</button>
          </div>
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