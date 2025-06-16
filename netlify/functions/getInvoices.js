// This function demonstrates Xero API connectivity
// Note: Without persistent token storage, this serves as a configuration test

const { XeroClient } = require('xero-node');

exports.handler = async function(event, context) {
  try {
    // Initialize the Xero client with the same configuration
    const xero = new XeroClient({
      clientId: process.env.XERO_CLIENT_ID,
      clientSecret: process.env.XERO_CLIENT_SECRET,
      redirectUris: [process.env.XERO_REDIRECT_URI],
      scopes: process.env.XERO_SCOPES.split(' ')
    });
    
    // Since we can't store tokens in serverless functions without a database,
    // this endpoint will return configuration status and instructions
    
    const configStatus = {
      status: 'Xero client configured successfully',
      clientConfigured: !!process.env.XERO_CLIENT_ID,
      redirectUri: process.env.XERO_REDIRECT_URI,
      scopes: process.env.XERO_SCOPES ? process.env.XERO_SCOPES.split(' ') : [],
      message: 'To fetch invoices, you need to complete the OAuth flow first',
      instructions: {
        step1: 'Visit /auth endpoint to start OAuth flow',
        step2: 'Complete Xero authentication',
        step3: 'For production, implement persistent token storage (database)',
        note: 'Serverless functions cannot store tokens in files'
      }
    };
    
    // Return the configuration status with CORS headers
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // In production, specify your domain instead of *
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET'
      },
      body: JSON.stringify(configStatus, null, 2)
    };
  } catch (error) {
    console.error('Error in getInvoices:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Configuration error',
        details: error.message,
        suggestion: 'Check environment variables are set correctly'
      })
    };
  }
}; 