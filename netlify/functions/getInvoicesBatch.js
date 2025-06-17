// This function fetches multiple specific invoices from Xero's API using POST requests
// ✅ AUTOMATIC CHUNKING: Send ANY number of invoice IDs - chunking happens automatically!
// ✅ SMART BATCHING: Optimizes chunk size and parallel requests based on data size
// Supports progressive loading and pagination for better UX
// POST body: { 
//   "tenant_id": "your-tenant-id", 
//   "invoice_ids": ["id1", "id2", ...],
//   "options": {
//     "load_mode": "all|progressive",
//     "chunk_size": 40,
//     "return_chunks": false,
//     "max_parallel": 5
//   }
// }

const { getValidToken } = require('./utils/tokenManager');
const { parseString } = require('xml2js');

// Helper function to chunk array into smaller arrays
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Helper function to fetch invoices for a chunk of IDs
async function fetchInvoiceChunk(accessToken, tenantId, invoiceIds) {
  const apiUrl = `https://api.xero.com/api.xro/2.0/Invoices?IDs=${invoiceIds.join(',')}`;
  
  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Xero-tenant-id': tenantId
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch invoice chunk: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  let invoicesData;
  let invoices = [];

  if (contentType.includes('application/json')) {
    invoicesData = await response.json();
    invoices = invoicesData.Invoices || [];
  } 
  else if (contentType.includes('text/xml') || contentType.includes('application/xml')) {
    const xmlData = await response.text();
    
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

    if (invoicesData.invoices) {
      const xmlInvoices = invoicesData.invoices.invoice || invoicesData.invoices.Invoice;
      invoices = Array.isArray(xmlInvoices) ? xmlInvoices : [xmlInvoices];
    }
  }
  else {
    const responseText = await response.text();
    throw new Error(`Unsupported content-type: ${contentType}. Response: ${responseText.substring(0, 200)}`);
  }

  return invoices;
}

// Helper function to format invoices
function formatInvoices(invoices) {
  return invoices.map(invoice => ({
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
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: ''
      };
    }

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error: 'Method not allowed',
          message: 'This endpoint only accepts POST requests',
          examples: {
            basic: {
              method: 'POST',
              body: {
                tenant_id: 'your-xero-tenant-id',
                invoice_ids: ['invoice-id-1', 'invoice-id-2', '...']
              },
              note: 'Send ANY number of invoice IDs - automatic chunking handles the rest!'
            },
            largeDataset: {
              method: 'POST',
              body: {
                tenant_id: 'your-xero-tenant-id',
                invoice_ids: ['id1', 'id2', '...', 'id1000'] // Even 1000+ invoices work!
              }
            },
            withOptions: {
              method: 'POST',
              body: {
                tenant_id: 'your-xero-tenant-id',
                invoice_ids: ['invoice-id-1', 'invoice-id-2', '...'],
                options: {
                  load_mode: 'progressive',
                  chunk_size: 20,
                  return_chunks: true,
                  max_parallel: 3
                }
              }
            }
          }
        }, null, 2)
      };
    }

    // Parse request body
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
          message: 'Please provide valid JSON with tenant_id and invoice_ids'
        }, null, 2)
      };
    }

    const { 
      tenant_id: tenantId, 
      invoice_ids: invoiceIds,
      options = {}
    } = requestBody;

    // Parse options with smart defaults
    const {
      load_mode = 'all',
      chunk_size = 40,
      return_chunks = false,
      max_parallel = Math.min(5, Math.ceil(validIds.length / 40)) // Auto-adjust based on data size
    } = options;

    // Auto-optimize chunk size for better performance
    let smartChunkSize = chunk_size;
    if (validIds.length > 200) {
      smartChunkSize = Math.min(30, chunk_size); // Smaller chunks for large datasets
    }

    // Validate required parameters
    if (!tenantId) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error: 'Missing tenant_id',
          message: 'Please provide tenant_id in the request body',
          example: {
            tenant_id: 'your-xero-tenant-id',
            invoice_ids: ['invoice-id-1', 'invoice-id-2']
          }
        }, null, 2)
      };
    }

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid invoice_ids',
          message: 'Please provide invoice_ids as a non-empty array',
          example: {
            tenant_id: 'your-xero-tenant-id',
            invoice_ids: ['invoice-id-1', 'invoice-id-2']
          }
        }, null, 2)
      };
    }

    // Validate invoice IDs
    const validIds = invoiceIds.filter(id => 
      typeof id === 'string' && id.trim().length > 0
    ).map(id => id.trim());

    if (validIds.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error: 'No valid invoice IDs provided',
          message: 'All invoice IDs must be non-empty strings'
        }, null, 2)
      };
    }

    // Validate chunk size (Xero API limit is ~40 due to URL length)
    const effectiveChunkSize = Math.min(Math.max(smartChunkSize, 1), 40);
    const effectiveMaxParallel = Math.min(Math.max(max_parallel, 1), 10);

    // Get valid token from Firestore
    const accessToken = await getValidToken(tenantId);
    console.log('Fetching batch invoices for tenant:', tenantId);
    console.log('Total invoice IDs requested:', validIds.length);
    console.log('Load mode:', load_mode, 'Chunk size:', effectiveChunkSize);

    // Split invoice IDs into chunks
    const chunks = chunkArray(validIds, effectiveChunkSize);
    console.log(`Split into ${chunks.length} chunks`);

    if (load_mode === 'progressive' && return_chunks) {
      // Progressive mode with chunked response
      const chunkResults = [];
      
      // Process chunks in batches to respect max_parallel limit
      for (let i = 0; i < chunks.length; i += effectiveMaxParallel) {
        const batchChunks = chunks.slice(i, i + effectiveMaxParallel);
        
        const batchPromises = batchChunks.map(async (chunk, batchIndex) => {
          const globalIndex = i + batchIndex;
          try {
            const invoices = await fetchInvoiceChunk(accessToken, tenantId, chunk);
            const formatted = formatInvoices(invoices);
            console.log(`Chunk ${globalIndex + 1}/${chunks.length}: fetched ${invoices.length} invoices`);
            
            return {
              chunkIndex: globalIndex,
              requestedIds: chunk,
              invoices: formatted,
              success: true,
              count: formatted.length
            };
          } catch (error) {
            console.error(`Chunk ${globalIndex + 1} failed:`, error.message);
            return {
              chunkIndex: globalIndex,
              requestedIds: chunk,
              invoices: [],
              success: false,
              error: error.message,
              count: 0
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        chunkResults.push(...batchResults);
      }

      // Calculate totals
      const allInvoices = chunkResults.filter(chunk => chunk.success).flatMap(chunk => chunk.invoices);
      const foundIds = allInvoices.map(inv => inv.invoiceID);
      const missingIds = validIds.filter(id => !foundIds.includes(id));

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({
          success: true,
          tenantId: tenantId,
          requestType: 'progressive_chunked_invoices',
          summary: {
            requestedCount: validIds.length,
            foundCount: allInvoices.length,
            missingCount: missingIds.length,
            chunksTotal: chunks.length,
            chunksSuccessful: chunkResults.filter(c => c.success).length,
            chunksFailed: chunkResults.filter(c => !c.success).length,
            totalAmount: allInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0),
            totalAmountDue: allInvoices.reduce((sum, inv) => sum + (inv.amountDue || 0), 0)
          },
          chunks: chunkResults,
          missingIds: missingIds,
          fetchedAt: new Date().toISOString()
        }, null, 2)
      };
    } else {
      // Standard mode - return all invoices combined (existing functionality)
      const chunkPromises = chunks.map((chunk, index) => 
        fetchInvoiceChunk(accessToken, tenantId, chunk)
          .then(invoices => {
            console.log(`Chunk ${index + 1}/${chunks.length}: fetched ${invoices.length} invoices`);
            return invoices;
          })
      );

      const chunkResults = await Promise.all(chunkPromises);
      const allInvoices = chunkResults.flat();
      console.log(`Successfully fetched ${allInvoices.length} total invoices`);

      const formattedInvoices = formatInvoices(allInvoices);
      const foundIds = formattedInvoices.map(inv => inv.invoiceID);
      const missingIds = validIds.filter(id => !foundIds.includes(id));

      const response = {
        success: true,
        tenantId: tenantId,
        requestType: 'batch_specific_invoices',
        summary: {
          requestedCount: validIds.length,
          foundCount: formattedInvoices.length,
          missingCount: missingIds.length,
          chunksProcessed: chunks.length,
          totalAmount: formattedInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0),
          totalAmountDue: formattedInvoices.reduce((sum, inv) => sum + (inv.amountDue || 0), 0)
        },
        requestedIds: validIds,
        foundIds: foundIds,
        missingIds: missingIds,
        invoices: formattedInvoices,
        fetchedAt: new Date().toISOString()
      };

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify(response, null, 2)
      };
    }

  } catch (error) {
    console.error('Error in batch invoice fetch:', error);
    
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
        suggestion: 'Check if access token is valid and invoice IDs exist'
      }, null, 2)
    };
  }
}; 