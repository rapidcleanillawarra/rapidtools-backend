// This function fetches invoices from Xero's API
// Supports both GET and POST methods:
// GET: /getInvoices?tenant_id=YOUR_TENANT_ID&invoice_numbers=INV-001,INV-002
// POST: /getInvoices with payload: {"tenant_id": "YOUR_TENANT_ID", "invoice_numbers": ["INV-001", "INV-002"]}
// POST with filters: {"tenant_id": "ID", "filters": {"status": ["PAID"], "date_from": "2023-01-01"}}

const { getValidToken } = require('./utils/tokenManager');
const { parseString } = require('xml2js');

// Helper function to build Xero API where clause
function buildWhereClause(filters) {
  const conditions = [];
  
  // Handle status filter in where clause (when combined with specific invoices)
  if (filters.status && Array.isArray(filters.status) && filters.status.length > 0) {
    const validStatuses = ['DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID', 'VOIDED', 'DELETED'];
    const filteredStatuses = filters.status.filter(status => validStatuses.includes(status.toUpperCase()));
    if (filteredStatuses.length > 0) {
      const statusConditions = filteredStatuses.map(status => `Status="${status}"`).join(' OR ');
      conditions.push(`(${statusConditions})`);
    }
  }
  
  if (filters.invoice_number_contains) {
    conditions.push(`InvoiceNumber.Contains("${filters.invoice_number_contains}")`);
  }
  
  if (filters.date_from) {
    conditions.push(`Date >= DateTime(${new Date(filters.date_from).getFullYear()}, ${new Date(filters.date_from).getMonth() + 1}, ${new Date(filters.date_from).getDate()})`);
  }
  
  if (filters.date_to) {
    conditions.push(`Date <= DateTime(${new Date(filters.date_to).getFullYear()}, ${new Date(filters.date_to).getMonth() + 1}, ${new Date(filters.date_to).getDate()})`);
  }
  
  if (filters.due_date_from) {
    conditions.push(`DueDate >= DateTime(${new Date(filters.due_date_from).getFullYear()}, ${new Date(filters.due_date_from).getMonth() + 1}, ${new Date(filters.due_date_from).getDate()})`);
  }
  
  if (filters.due_date_to) {
    conditions.push(`DueDate <= DateTime(${new Date(filters.due_date_to).getFullYear()}, ${new Date(filters.due_date_to).getMonth() + 1}, ${new Date(filters.due_date_to).getDate()})`);
  }
  
  if (filters.total_greater_than) {
    conditions.push(`Total >= ${filters.total_greater_than}`);
  }
  
  if (filters.total_less_than) {
    conditions.push(`Total <= ${filters.total_less_than}`);
  }
  
  if (filters.amount_due_greater_than) {
    conditions.push(`AmountDue >= ${filters.amount_due_greater_than}`);
  }
  
  if (filters.contact_name_contains) {
    conditions.push(`Contact.Name.Contains("${filters.contact_name_contains}")`);
  }
  
  return conditions.length > 0 ? conditions.join(' AND ') : null;
}

// Helper function to format date for Xero API
function formatDateForXero(dateString) {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
  } catch {
    return null;
  }
}

exports.handler = async function(event, context) {
  try {
    // Handle preflight CORS request
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
        },
        body: ''
      };
    }

    let tenantId, invoiceIds, invoiceNumbers, page, pageSize, filters = {};

    // Handle both GET and POST requests
    if (event.httpMethod === 'GET') {
      // GET request - parameters from URL
      tenantId = event.queryStringParameters?.tenant_id;
      invoiceIds = event.queryStringParameters?.invoice_ids;
      invoiceNumbers = event.queryStringParameters?.invoice_numbers;
      page = parseInt(event.queryStringParameters?.page || '1');
      pageSize = Math.min(parseInt(event.queryStringParameters?.page_size || '10'), 100);
    } else if (event.httpMethod === 'POST') {
      // POST request - parameters from body
      let requestBody;
      try {
        requestBody = JSON.parse(event.body || '{}');
      } catch (error) {
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            success: false,
            error: 'Invalid JSON in request body',
            message: 'Please provide valid JSON with tenant_id and invoice parameters'
          }, null, 2)
        };
      }

      tenantId = requestBody.tenant_id;
      // Support both array and comma-separated string formats
      invoiceIds = Array.isArray(requestBody.invoice_ids) ? 
        requestBody.invoice_ids.join(',') : requestBody.invoice_ids;
      invoiceNumbers = Array.isArray(requestBody.invoice_numbers) ? 
        requestBody.invoice_numbers.join(',') : requestBody.invoice_numbers;
      page = parseInt(requestBody.page || '1');
      pageSize = Math.min(parseInt(requestBody.page_size || '10'), 100);
      filters = requestBody.filters || {};
    } else {
      return {
        statusCode: 405,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error: 'Method not allowed',
          message: 'This endpoint accepts GET and POST requests only'
        }, null, 2)
      };
    }
    
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
          message: 'Please provide tenant_id',
          examples: {
            get_basic: 'GET /.netlify/functions/getInvoices?tenant_id=YOUR_TENANT_ID',
            get_withPagination: 'GET /.netlify/functions/getInvoices?tenant_id=YOUR_TENANT_ID&page=1&page_size=10',
            get_specificInvoicesById: 'GET /.netlify/functions/getInvoices?tenant_id=YOUR_TENANT_ID&invoice_ids=id1,id2,id3',
            get_specificInvoicesByNumber: 'GET /.netlify/functions/getInvoices?tenant_id=YOUR_TENANT_ID&invoice_numbers=INV-001,INV-002',
            post_basic: {
              method: 'POST',
              body: {
                tenant_id: 'YOUR_TENANT_ID',
                page: 1,
                page_size: 10
              }
            },
            post_specificByNumbers: {
              method: 'POST',
              body: {
                tenant_id: 'YOUR_TENANT_ID',
                invoice_numbers: ['INV-001', 'INV-002']
              }
            },
            post_withFilters: {
              method: 'POST',
              body: {
                tenant_id: 'YOUR_TENANT_ID',
                filters: {
                  status: ['PAID', 'AUTHORISED'],
                  date_from: '2023-01-01',
                  date_to: '2023-12-31',
                  due_date_from: '2023-06-01',
                  invoice_number_contains: 'INV',
                  total_greater_than: 100,
                  contact_name_contains: 'ABC Company'
                }
              }
            },
            post_specificByIds: {
              method: 'POST',
              body: {
                tenant_id: 'YOUR_TENANT_ID',
                invoice_ids: ['id1', 'id2', 'id3']
              }
            }
          },
          parameters: {
            tenant_id: 'Required - Xero tenant ID (URL param for GET, body param for POST)',
            invoice_ids: 'Optional - Invoice IDs (comma-separated for GET, array for POST)',
            invoice_numbers: 'Optional - Invoice numbers (comma-separated for GET, array for POST)',
            page: 'Optional - Page number (default: 1)',
            page_size: 'Optional - Records per page (default: 10, max: 100)',
            filters: {
              description: 'Optional - Filters for POST requests only',
              status: 'Array of statuses: ["DRAFT", "SUBMITTED", "AUTHORISED", "PAID", "VOIDED", "DELETED"]',
              date_from: 'Date string (YYYY-MM-DD) - Invoice date from',
              date_to: 'Date string (YYYY-MM-DD) - Invoice date to',
              due_date_from: 'Date string (YYYY-MM-DD) - Due date from',
              due_date_to: 'Date string (YYYY-MM-DD) - Due date to',
              invoice_number_contains: 'String - Filter by invoice number containing text',
              total_greater_than: 'Number - Minimum total amount',
              total_less_than: 'Number - Maximum total amount',
              amount_due_greater_than: 'Number - Minimum amount due',
              contact_name_contains: 'String - Filter by contact name containing text'
            }
          }
        }, null, 2)
      };
    }

    // Get valid token from Firestore (auto-refresh if needed)
    const accessToken = await getValidToken(tenantId);

    console.log('Fetching invoices with access token for tenant:', tenantId);
    console.log('Request method:', event.httpMethod);
    console.log('Filters applied:', Object.keys(filters).length > 0 ? filters : 'None');
    console.log('Access token (first 20 chars):', accessToken ? accessToken.substring(0, 20) + '...' : 'null');

    // Check if specific invoice IDs or numbers are requested
    let apiUrl = 'https://api.xero.com/api.xro/2.0/Invoices';
    let queryParams = [];

    if (invoiceIds && invoiceNumbers) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          success: false,
          error: 'Cannot use both invoice_ids and invoice_numbers',
          message: 'Please use either invoice_ids OR invoice_numbers, not both'
        }, null, 2)
      };
    }

    // Handle specific invoice IDs or numbers with optional filtering
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
            message: 'Please provide valid invoice IDs'
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
            suggestion: 'Use getInvoicesBatch endpoint for larger batches',
            providedCount: idsArray.length
          }, null, 2)
        };
      }

      // Use where clause to combine IDs with filters
      const whereConditions = [`InvoiceID=Guid("${idsArray.join('") OR InvoiceID=Guid("')}")`];
      
      // Add other filter conditions
      const additionalFilters = buildWhereClause(filters);
      if (additionalFilters) {
        whereConditions.push(additionalFilters);
      }
      
      queryParams.push(`where=${encodeURIComponent(`(${whereConditions.join(') AND (')})`)}`);
      
    } else if (invoiceNumbers) {
      // Fetch specific invoices by Numbers with optional filtering
      console.log('Fetching specific invoices by Numbers:', invoiceNumbers);
      
      // Validate and clean invoice numbers
      const numbersArray = invoiceNumbers.split(',').map(num => num.trim()).filter(num => num.length > 0);
      
      if (numbersArray.length === 0) {
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            success: false,
            error: 'Invalid invoice_numbers parameter',
            message: 'Please provide valid invoice numbers'
          }, null, 2)
        };
      }

      if (numbersArray.length > 40) {
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            success: false,
            error: 'Too many invoice numbers',
            message: 'Maximum 40 invoice numbers allowed per request due to URL length limits',
            suggestion: 'Use getInvoicesBatch endpoint for larger batches',
            providedCount: numbersArray.length
          }, null, 2)
        };
      }

      // Use where clause to combine invoice numbers with filters
      const whereConditions = [`InvoiceNumber="${numbersArray.join('" OR InvoiceNumber="')}"`];
      
      // Add other filter conditions
      const additionalFilters = buildWhereClause(filters);
      if (additionalFilters) {
        whereConditions.push(additionalFilters);
      }
      
      queryParams.push(`where=${encodeURIComponent(`(${whereConditions.join(') AND (')})`)}`);
      
    } else {
      // Apply filters for general invoice fetching
      
      // Handle status filter using Xero's Statuses parameter (only when not using specific IDs/numbers)
      if (filters.status && Array.isArray(filters.status) && filters.status.length > 0) {
        const validStatuses = ['DRAFT', 'SUBMITTED', 'AUTHORISED', 'PAID', 'VOIDED', 'DELETED'];
        const filteredStatuses = filters.status.filter(status => validStatuses.includes(status.toUpperCase()));
        if (filteredStatuses.length > 0) {
          queryParams.push(`Statuses=${filteredStatuses.join(',')}`);
        }
      }
      
      // Build where clause for other filters
      const whereClause = buildWhereClause(filters);
      if (whereClause) {
        queryParams.push(`where=${encodeURIComponent(whereClause)}`);
      }
    }
    
    // Add pagination for all cases
    queryParams.push(`page=${page}`);
    queryParams.push(`pagesize=${pageSize}`);
    
    console.log(`Fetching invoices from Xero (page ${page}, size ${pageSize})...`);

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
    const searchType = invoiceIds ? 'specific_invoices_by_id' : 
                      (invoiceNumbers ? 'specific_invoices_by_number' : 
                      (Object.keys(filters).length > 0 ? 'filtered_invoices' : 'paginated_all'));
    
    const response = {
      success: true,
      tenantId: tenantId,
      requestMethod: event.httpMethod,
      requestType: searchType,
      appliedFilters: Object.keys(filters).length > 0 ? filters : null,
      ...(invoiceIds || invoiceNumbers ? {
        requestedItems: (invoiceIds || invoiceNumbers).split(',').map(item => item.trim()),
        foundCount: invoices.length
      } : {
        pagination: {
          page: page,
          pageSize: pageSize,
          recordsReturned: invoices.length,
          nextPage: invoices.length === pageSize ? page + 1 : null
        }
      }),
      summary: {
        totalInvoices: invoices.length,
        totalAmount: formattedInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0),
        totalAmountDue: formattedInvoices.reduce((sum, inv) => sum + (inv.amountDue || 0), 0),
        statusBreakdown: formattedInvoices.reduce((acc, inv) => {
          acc[inv.status] = (acc[inv.status] || 0) + 1;
          return acc;
        }, {})
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
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
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