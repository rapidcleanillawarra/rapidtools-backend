// This function fetches invoices from Xero's API
// For testing: Pass access_token as query parameter
// Example: /getInvoices?access_token=YOUR_TOKEN

const { getValidToken } = require('./utils/tokenManager');

exports.handler = async function(event, context) {
  try {
    // Get tenant ID from query parameters or use a default approach
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
          message: 'Please provide tenant_id as a query parameter',
          example: '/.netlify/functions/getInvoices?tenant_id=YOUR_TENANT_ID'
        }, null, 2)
      };
    }

    // Get valid token from Firestore (auto-refresh if needed)
    const accessToken = await getValidToken(tenantId);

    console.log('Fetching invoices with access token for tenant:', tenantId);
    console.log('Access token (first 20 chars):', accessToken ? accessToken.substring(0, 20) + '...' : 'null');

    // Fetch invoices from Xero Accounting API using the provided tenant ID
    console.log('Fetching invoices from Xero...');
    const invoicesResponse = await fetch(`https://api.xero.com/api.xro/2.0/Invoices`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Xero-tenant-id': tenantId
      }
    });

    if (!invoicesResponse.ok) {
      const errorText = await invoicesResponse.text();
      throw new Error(`Failed to fetch invoices: ${invoicesResponse.status} ${invoicesResponse.statusText} - ${errorText}`);
    }

    // Check if response is JSON before parsing
    const contentType = invoicesResponse.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const responseText = await invoicesResponse.text();
      console.error('Non-JSON response from Xero:', {
        status: invoicesResponse.status,
        contentType,
        responseText: responseText.substring(0, 500) // Log first 500 chars
      });
      throw new Error(`Xero returned non-JSON response. Content-Type: ${contentType}. Response: ${responseText.substring(0, 200)}`);
    }

    const invoicesData = await invoicesResponse.json();
    const invoices = invoicesData.Invoices || [];

    console.log(`Successfully fetched ${invoices.length} invoices`);

    // Format the response with useful information
    const formattedInvoices = invoices.map(invoice => ({
      invoiceID: invoice.InvoiceID,
      invoiceNumber: invoice.InvoiceNumber,
      type: invoice.Type,
      status: invoice.Status,
      date: invoice.Date,
      dueDate: invoice.DueDate,
      total: invoice.Total,
      amountDue: invoice.AmountDue,
      amountPaid: invoice.AmountPaid,
      contact: {
        contactID: invoice.Contact?.ContactID,
        name: invoice.Contact?.Name
      },
      currencyCode: invoice.CurrencyCode,
      reference: invoice.Reference
    }));

    const response = {
      success: true,
      tenantId: tenantId,
      summary: {
        totalInvoices: invoices.length,
        totalAmount: invoices.reduce((sum, inv) => sum + (inv.Total || 0), 0),
        totalAmountDue: invoices.reduce((sum, inv) => sum + (inv.AmountDue || 0), 0)
      },
      invoices: formattedInvoices,
      fetchedAt: new Date().toISOString()
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET'
      },
      body: JSON.stringify(response, null, 2)
    };

  } catch (error) {
    console.error('Error fetching invoices:', error);
    
    // Handle specific token errors
    if (error.message === 'No Xero tokens found for user') {
      return {
        statusCode: 401,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          success: false,
          error: 'Authentication required',
          message: 'Please complete Xero OAuth flow first',
          authUrl: '/.netlify/functions/auth'
        }, null, 2)
      };
    }
    
    if (error.message.includes('Token refresh failed')) {
      return {
        statusCode: 401,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          success: false,
          error: 'Token refresh failed',
          message: 'Please re-authenticate with Xero',
          authUrl: '/.netlify/functions/auth'
        }, null, 2)
      };
    }
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        success: false,
        error: 'Failed to fetch invoices from Xero',
        details: error.message,
        suggestion: 'Check if access token is valid and not expired',
        troubleshooting: {
          step1: 'Verify token is not expired (tokens last 30 minutes)',
          step2: 'Ensure token has accounting.transactions scope',
          step3: 'Check Netlify function logs for detailed error'
        }
      }, null, 2)
    };
  }
}; 