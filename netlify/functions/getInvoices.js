// This function fetches invoices from Xero's API
// For testing: Pass access_token as query parameter
// Example: /getInvoices?access_token=YOUR_TOKEN

const { getValidToken } = require('./utils/tokenManager');
const { parseString } = require('xml2js');

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
          examples: {
            basic: '/.netlify/functions/getInvoices?tenant_id=YOUR_TENANT_ID',
            withPagination: '/.netlify/functions/getInvoices?tenant_id=YOUR_TENANT_ID&page=1&page_size=10'
          },
          parameters: {
            tenant_id: 'Required - Xero tenant ID',
            page: 'Optional - Page number (default: 1)',
            page_size: 'Optional - Records per page (default: 10, max: 100)'
          }
        }, null, 2)
      };
    }

    // Get valid token from Firestore (auto-refresh if needed)
    const accessToken = await getValidToken(tenantId);

    console.log('Fetching invoices with access token for tenant:', tenantId);
    console.log('Access token (first 20 chars):', accessToken ? accessToken.substring(0, 20) + '...' : 'null');

    // Get pagination parameters
    const page = parseInt(event.queryStringParameters?.page || '1');
    const pageSize = Math.min(parseInt(event.queryStringParameters?.page_size || '10'), 100); // Max 100 records
    
    // Fetch invoices from Xero Accounting API using the provided tenant ID
    console.log(`Fetching invoices from Xero (page ${page}, size ${pageSize})...`);
    const invoicesResponse = await fetch(`https://api.xero.com/api.xro/2.0/Invoices?page=${page}&pagesize=${pageSize}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Xero-tenant-id': tenantId
      }
    });

    if (!invoicesResponse.ok) {
      const errorText = await invoicesResponse.text();
      throw new Error(`Failed to fetch invoices: ${invoicesResponse.status} ${invoicesResponse.statusText} - ${errorText}`);
    }

    // Handle both JSON and XML responses from Xero
    const contentType = invoicesResponse.headers.get('content-type') || '';
    console.log('Response content-type:', contentType);
    
    let invoicesData;
    let invoices = [];

    if (contentType.includes('application/json')) {
      console.log('Parsing JSON response...');
      invoicesData = await invoicesResponse.json();
      invoices = invoicesData.Invoices || [];
    } 
    else if (contentType.includes('text/xml') || contentType.includes('application/xml')) {
      console.log('Parsing XML response...');
      const xmlData = await invoicesResponse.text();
      
      // Parse XML to JavaScript object
      invoicesData = await new Promise((resolve, reject) => {
        parseString(xmlData, { 
          explicitArray: false,
          mergeAttrs: true,
          normalize: true,
          normalizeTags: true,
          trim: true
        }, (err, result) => {
          if (err) {
            reject(new Error(`XML parse error: ${err.message}`));
          } else {
            resolve(result.response || result.Response);
          }
        });
      });

      // Handle XML structure - invoices can be single object or array
      if (invoicesData.invoices) {
        const xmlInvoices = invoicesData.invoices.invoice || invoicesData.invoices.Invoice;
        invoices = Array.isArray(xmlInvoices) ? xmlInvoices : [xmlInvoices];
      }
    }
    else {
      const responseText = await invoicesResponse.text();
      console.error('Unsupported response format:', {
        status: invoicesResponse.status,
        contentType,
        responseText: responseText.substring(0, 500)
      });
      throw new Error(`Unsupported content-type: ${contentType}. Response: ${responseText.substring(0, 200)}`);
    }

    console.log(`Successfully fetched ${invoices.length} invoices`);

    // Format the response with useful information (handles both JSON and XML structures)
    const formattedInvoices = invoices.map(invoice => ({
      invoiceID: invoice.InvoiceID || invoice.invoiceid,
      invoiceNumber: invoice.InvoiceNumber || invoice.invoicenumber,
      type: invoice.Type || invoice.type,
      status: invoice.Status || invoice.status,
      date: invoice.Date || invoice.date,
      dueDate: invoice.DueDate || invoice.duedate,
      total: parseFloat(invoice.Total || invoice.total || 0),
      amountDue: parseFloat(invoice.AmountDue || invoice.amountdue || 0),
      amountPaid: parseFloat(invoice.AmountPaid || invoice.amountpaid || 0),
      contact: {
        contactID: invoice.Contact?.ContactID || invoice.contact?.contactid,
        name: invoice.Contact?.Name || invoice.contact?.name
      },
      currencyCode: invoice.CurrencyCode || invoice.currencycode,
      reference: invoice.Reference || invoice.reference
    }));

    const response = {
      success: true,
      tenantId: tenantId,
      pagination: {
        page: page,
        pageSize: pageSize,
        recordsReturned: invoices.length,
        nextPage: invoices.length === pageSize ? page + 1 : null
      },
      summary: {
        totalInvoices: invoices.length,
        totalAmount: formattedInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0),
        totalAmountDue: formattedInvoices.reduce((sum, inv) => sum + (inv.amountDue || 0), 0)
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