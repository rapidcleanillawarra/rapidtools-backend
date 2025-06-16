// This function initiates the Xero OAuth2 flow by redirecting the user to Xero's authorization page

const { XeroClient } = require('xero-node');

exports.handler = async function(event, context) {
  try {
    // Initialize the Xero client with credentials from environment variables
    const xero = new XeroClient({
      clientId: process.env.XERO_CLIENT_ID,
      clientSecret: process.env.XERO_CLIENT_SECRET,
      redirectUris: [process.env.XERO_REDIRECT_URI],
      scopes: process.env.XERO_SCOPES.split(' ')
    });
    
    // Build the consent URL where users will be redirected to authenticate with Xero
    const consentUrl = await xero.buildConsentUrl();
    
    // Redirect the user to Xero's authentication page
    return {
      statusCode: 302,
      headers: {
        Location: consentUrl
      },
      body: JSON.stringify({ redirecting: true })
    };
  } catch (error) {
    console.error('Authentication error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to initialize authentication' })
    };
  }
}; 