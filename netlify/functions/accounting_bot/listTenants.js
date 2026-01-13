const { getAvailableTenants } = require('./utils/tokenManager');

exports.handler = async function(event, context) {
  try {
    const tenants = await getAvailableTenants();
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET'
      },
      body: JSON.stringify({
        success: true,
        message: 'Available Xero tenant connections',
        tenants: tenants,
        usage: {
          getInvoices: '/.netlify/functions/getInvoices?tenant_id=TENANT_ID',
          example: tenants.length > 0 ? `/.netlify/functions/getInvoices?tenant_id=${tenants[0].tenantId}` : 'No tenants available'
        }
      }, null, 2)
    };
    
  } catch (error) {
    console.error('Error listing tenants:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: 'Failed to list tenants',
        details: error.message
      }, null, 2)
    };
  }
}; 