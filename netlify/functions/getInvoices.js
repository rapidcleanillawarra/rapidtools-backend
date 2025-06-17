// This function fetches invoices from Xero's API
// For testing: Pass access_token as query parameter
// Example: /getInvoices?access_token=YOUR_TOKEN
// New: Fetch specific invoices by IDs: /getInvoices?tenant_id=YOUR_TENANT_ID&invoice_ids=id1,id2,id3

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
            withPagination: '/.netlify/functions/getInvoices?tenant_id=YOUR_TENANT_ID&page=1&page_size=10',
            specificInvoices: '/.netlify/functions/getInvoices?tenant_id=YOUR_TENANT_ID&invoice_ids=id1,id2,id3',
            specificInvoicesLarge: '/.netlify/functions/getInvoices?tenant_id=YOUR_TENANT_ID&invoice_ids=["id1","id2",...] (POST body for >40 IDs)'
          },
          parameters: {
            tenant_id: 'Required - Xero tenant ID',
            invoice_ids: 'Optional - Comma-separated invoice IDs (max ~40 due to URL length)',
            page: 'Optional - Page number (default: 1, ignored when using invoice_ids)',
            page_size: 'Optional - Records per page (default: 10, max: 100, ignored when using invoice_ids)'
          }
        }, null, 2)
      };
    }

    // Get valid token from Firestore (auto-refresh if needed)
    const accessToken = await getValidToken(tenantId);

    console.log('Fetching invoices with access token for tenant:', tenantId);
    console.log('Access token (first 20 chars):', accessToken ? accessToken.substring(0, 20) + '...' : 'null');

    // Check if specific invoice IDs are requested
    const invoiceIds = event.queryStringParameters?.invoice_ids;
    let apiUrl = 'https://api.xero.com/api.xro/2.0/Invoices';
    let queryParams = [];

    if (invoiceIds) {
      // Fetch specific invoices by IDs
      console.log('Fetching specific invoices by IDs:', invoiceIds);
      
      // Validate and clean invoice IDs
      const idsArray = invoiceIds.split(',').map(id => id.trim()).filter(id => id.length > 0);
      
      if (idsArray.length === 0) {
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            success: false,
            error: 'Invalid invoice_ids parameter',
            message: 'Please provide valid comma-separated invoice IDs'
          }, null, 2)
        };
      }

      if (idsArray.length > 40) {
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            success: false,
            error: 'Too many invoice IDs',
            message: 'Maximum 40 invoice IDs allowed per request due to URL length limits',
            suggestion: 'Consider using POST request for larger batches or split into multiple requests',
            providedCount: idsArray.length
          }, null, 2)
        };
      }

      queryParams.push(`IDs=${idsArray.join(',')}`);
    } else {
      // Fetch all invoices with pagination (existing functionality)
      const page = parseInt(event.queryStringParameters?.page || '1');
      const pageSize = Math.min(parseInt(event.queryStringParameters?.page_size || '10'), 100);
      
      queryParams.push(`page=${page}`);
      queryParams.push(`pagesize=${pageSize}`);
      
      console.log(`Fetching all invoices from Xero (page ${page}, size ${pageSize})...`);
    }

    // Build final API URL
    if (queryParams.length > 0) {
      apiUrl += '?' + queryParams.join('&');
    }

    console.log('API URL:', apiUrl);

    // Fetch invoices from Xero Accounting API
    const invoicesResponse = await fetch(apiUrl, {
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

    // Build response based on request type
    const response = {
      success: true,
      tenantId: tenantId,
      requestType: invoiceIds ? 'specific_invoices' : 'paginated_all',
      ...(invoiceIds ? {
        requestedIds: invoiceIds.split(',').map(id => id.trim()),
        foundCount: invoices.length
      } : {
        pagination: {
          page: parseInt(event.queryStringParameters?.page || '1'),
          pageSize: parseInt(event.queryStringParameters?.page_size || '10'),
          recordsReturned: invoices.length,
          nextPage: invoices.length === parseInt(event.queryStringParameters?.page_size || '10') ? 
                   parseInt(event.queryStringParameters?.page || '1') + 1 : null
        }
      }),
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