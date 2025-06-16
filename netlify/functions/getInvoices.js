// This function retrieves invoices from Xero's API
// It reads the stored token, makes an API request, and returns the invoice data

const { XeroClient } = require('xero-node');
const fs = require('fs');

exports.handler = async function(event, context) {
  try {
    // Initialize the Xero client with the same configuration
    const xero = new XeroClient({
      clientId: process.env.XERO_CLIENT_ID,
      clientSecret: process.env.XERO_CLIENT_SECRET,
      redirectUris: [process.env.XERO_REDIRECT_URI],
      scopes: process.env.XERO_SCOPES.split(' ')
    });
    
    // Read the stored token set from file
    // In production, use a secure storage solution instead
    const tokenSetJson = fs.readFileSync('./xero_tokens.json');
    const tokenSet = JSON.parse(tokenSetJson);
    
    // Set the token set in the Xero client
    await xero.setTokenSet(tokenSet);
    
    // Get the first connected tenant
    const tenants = await xero.updateTenants();
    const firstTenant = tenants[0];
    
    if (!firstTenant) {
      throw new Error('No connected Xero organizations found');
    }
    
    // Get invoices from Xero's Accounting API
    const response = await xero.accountingApi.getInvoices(firstTenant.tenantId);
    const invoices = response.body.invoices;
    
    // Return the invoices with CORS headers
    // CORS headers are required to allow your front-end application on a different domain
    // to receive the response from this API
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // In production, specify your domain instead of *
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET'
      },
      body: JSON.stringify(invoices)
    };
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Failed to fetch invoices from Xero' })
    };
  }
}; 