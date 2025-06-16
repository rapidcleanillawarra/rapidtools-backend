// This function handles the OAuth2 callback from Xero after user authorization
// It exchanges the authorization code for access tokens and stores them

const { XeroClient } = require('xero-node');
const fs = require('fs');
const path = require('path');

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
    
    // Store the tokens
    // NOTE: In production, you should use a secure storage solution like AWS Secrets Manager,
    // Netlify environment variables, or a database with encryption. Writing to a file 
    // is only demonstrated for simplicity but is NOT secure for production use.
    fs.writeFileSync('./xero_tokens.json', JSON.stringify(tokenSet));
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html'
      },
      body: `
        <html>
          <body>
            <h1>Successfully connected to Xero!</h1>
            <p>You can close this window and return to the application.</p>
          </body>
        </html>
      `
    };
  } catch (error) {
    console.error('Callback error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process authorization callback' })
    };
  }
}; 